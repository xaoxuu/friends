import axios from 'axios';
import * as cheerio from 'cheerio';
import { config } from '../config.js';
import { logger, handleError, withRetry, ConcurrencyPool, IssueManager } from './utils.js';

async function checkLinkInPage(url, headers, targetLink) {
  logger('info', `Checking link in page: ${url}`);
  const response = await axios.get(url, {
    timeout: config.request.timeout,
    headers: headers,
    validateStatus: status => status < 500
  });
  // 等待10秒，让异步内容加载完成
  await new Promise(resolve => setTimeout(resolve, 10000));
  const $ = cheerio.load(response.data);
  const links = $('a').map((_, el) => $(el).attr('href')).get();
  return links.some(link => {
    if (!link || !targetLink) return false;
    const normalizedLink = link.replace(/\/+$/, '');
    const normalizedTarget = targetLink.replace(/\/+$/, '');
    return normalizedLink === normalizedTarget;
  });
}

async function findFriendLinks(issueNumber) {
  logger('info', `find issue #${issueNumber}`);
  const [owner, repo] = (config.base.debug_repo || process.env.GITHUB_REPOSITORY).split('/');
  try {
    const octokit = new IssueManager().octokit;
    const issue = await octokit.issues.get({
      owner,
      repo,
      issue_number: issueNumber
    });
    const friendLinkMatch = issue.data.body?.match(/友链地址[：:]?\s*([^\s]+)/s);
    if (friendLinkMatch) {
      const friendLink = friendLinkMatch[1];
      logger('info', `Found issue #${issueNumber} link:`, friendLink);
      return [friendLink];
    } else {
      logger('info', `Not Found issue #${issueNumber} link:`);
    }
    return [];
  } catch (error) {
    logger('warn', `Error getting issue #${issueNumber}: ${error.message}`);
    return [];
  }
}

async function checkSite(item) {
  const url = item.url;
  var checkResult = { valid: false };
  try {
    const { min, max } = config.request.delay;
    const delay = Math.floor(Math.random() * (max - min)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));

    const userAgents = config.request.user_agents;
    const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    const headers = {
      'User-Agent': randomUserAgent,
      ...config.request.headers
    };

    // 检查当前页面是否可访问
    const response = await axios.get(url, {
      timeout: config.request.timeout,
      headers: headers,
      validateStatus: status => status < 500
    });
    logger('info', `#${item.issue_number} Checked site: ${url} status: ${response.status}`);
    switch (response.status) {
      case 200:
        checkResult.valid = true;
        break;
      case 301:
        checkResult.valid = true;
        checkResult.label = config.base.valid_labels.redirect;
        break;
      case 403:
        // 如果状态码为 403，可能是由于反爬机制
        checkResult.valid = true;
        checkResult.label = config.base.valid_labels.unknown;
        break;
      default:
        checkResult.valid = false;
        checkResult.label = config.base.invalid_labels.unreachable;
        break;
    }
  } catch (error) {
    if (error.response) {
      if (error.response.status === 403) {
        logger('warn', `Access forbidden for site ${url}, possibly due to anti-crawling measures`);
      } else if (error.response.status === 429) {
        logger('warn', `Rate limited for site ${url}, will retry later`);
      }
    }
    handleError(error, `#${item.issue_number} Error checking site ${url}`);
    checkResult.valid = false;
    checkResult.label = config.base.invalid_labels.unreachable;
  }
  return checkResult;
}

async function processData() {
  if (!config.link_checker.enabled) {
    logger('info', 'Link checker is disabled in config');
    return;
  }

  try {
    const issueManager = new IssueManager();
    const validSites = await issueManager.getIssues({
      exclude_labels: config.link_checker.exclude_labels,
      include_keyword: config.link_checker.include_keyword
    });
    logger('info', `Total sites to check: ${validSites.length}`);
    let errors = [];
    
    // 创建并发控制池，最大并发数为 5
    const pool = new ConcurrencyPool(5);
    const checkPromises = validSites.map(item => {
      return pool.add(async () => {
        try {
          logger('info', `#${item.issue_number} Checking site: ${item.url}`);
          const result = await withRetry(
            () => checkSite(item),
            config.request.retry_times
          );
          
          let labels = [];
          if (result.label) {
            labels = [...(item.labels.map(label => label.name) || []), result.label];
          }
          labels = [...new Set(labels)];
          await issueManager.updateIssueLabels(item.issue_number, labels);
          logger('info', `Finished checking site for issue #${item.issue_number}, result: ${JSON.stringify(result)}`);
        } catch (error) {
          errors.push({ issue: item.issue_number, url: item.url, error: error.message });
          logger('error', `#${item.issue_number} Error processing site ${item.url} ${error.message}`);
        }
      });
    });

    // 等待所有检查任务完成
    await Promise.all(checkPromises);

    if (errors.length > 0) {
      logger('warn', `Completed with ${errors.length} errors:`);
      errors.forEach(err => {
        logger('warn', `Issue #${err.issue} (${err.url}): ${err.error}`);
      });
      process.exit(1);
    }
  } catch (error) {
    handleError(error, 'Error processing data');
    process.exit(1);
  }
}

processData();