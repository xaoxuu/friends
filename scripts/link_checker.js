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

    const response = await axios.get(url, {
      timeout: config.request.timeout,
      headers: headers,
      validateStatus: status => status < 500
    });
    const $ = cheerio.load(response.data);

    // 检查当前页面是否包含目标链接
    if (await checkLinkInPage(url, headers, config.link_checker.targetLink)) {
      return { status: config.base.site_status.valid };
    }
    
    // 在友链页面中查找目标链接
    const friendLinks = await findFriendLinks(item.issue_number);
    for (const friendLink of friendLinks) {
      try {
        if (await checkLinkInPage(friendLink, headers, config.link_checker.targetLink)) {
          return { status: config.base.site_status.valid };
        }
      } catch (error) {
        logger('warn', `#${item.issue_number} Error checking friend page ${friendLink}: ${error.message}`);
      }
    }

    return { status: config.base.site_status.invalid };
  } catch (error) {
    if (error.response) {
      if (error.response.status === 403) {
        logger('warn', `Access forbidden for site ${url}, possibly due to anti-crawling measures`);
      } else if (error.response.status === 429) {
        logger('warn', `Rate limited for site ${url}, will retry later`);
      }
    }
    handleError(error, `#${item.issue_number} Error checking site ${url}`);
    return { status: config.base.site_status.error };
  }
}

async function processData() {
  if (!config.link_checker.enabled) {
    logger('info', 'Link checker is disabled in config');
    return;
  }

  try {
    const issueManager = new IssueManager();
    const validSites = await issueManager.getIssues(config.link_checker);
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
          switch (result.status) {
            case config.base.site_status.valid:
              break;
            case config.base.site_status.invalid:
              labels = [...(item.labels.map(label => label.name) || []), config.link_checker.error_labels.invalid];
              break;
            case config.base.site_status.error:
              labels = [...(item.labels.map(label => label.name) || []), config.link_checker.error_labels.unreachable];
              break;
          }
          
          labels = [...new Set(labels)];
          await issueManager.updateIssueLabels(item.issue_number, labels);
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