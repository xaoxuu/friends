import axios from 'axios';
import * as cheerio from 'cheerio';
import { config } from '../config.js';
import { logger, handleError, withRetry, ConcurrencyPool, IssueManager } from './utils.js';

async function checkSite(item) {
  const url = item.url;
  var checkResult = { valid: false };
  try {
    // 动态延时策略
    const { min, max } = config.request.delay;
    const delay = Math.floor(Math.random() * (max - min)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));

    // 随机选择 User-Agent
    const userAgents = config.request.user_agents;
    const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    
    // 构建请求头
    const headers = {
      'User-Agent': randomUserAgent,
      ...config.request.headers
    };

    const response = await axios.get(url, {
      timeout: config.request.timeout,
      headers: headers,
      validateStatus: status => status < 500 // 允许除500以外的状态码
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
    const $ = cheerio.load(response.data);
    const themeMetaTag = $(config.theme_checker.meta_tag);
    
    // 通用的版本号匹配函数
    const extractVersion = (content) => {
      if (!content) return null;
      // 匹配 URL 路径中的版本号
      const urlVersionMatch = content.match(/\/tree\/([\d.]+(?:-[\w.]+)?)/)?.[1];
      if (urlVersionMatch) return urlVersionMatch;
      // 匹配直接的版本号格式
      const directVersionMatch = content.match(/^\d+\.\d+\.\d+(?:-[\w.]+)?$/)?.[0];
      return directVersionMatch || null;
    };
    
    if (themeMetaTag.length > 0) {
      const themeName = themeMetaTag.attr(config.theme_checker.name_attr);
      const content = themeMetaTag.attr(config.theme_checker.content_attr);
      const themeVersion = themeMetaTag.attr(config.theme_checker.version_attr) || extractVersion(content);
      
      if (themeName === config.theme_checker.theme_name || (content && themeVersion)) {
        checkResult.valid = true;
        checkResult.label = themeVersion;
        return checkResult;
      }
    }
    
    // 尝试从备选meta标签中解析版本号
    const altThemeMetaTag = $(`meta[name="${config.theme_checker.theme_name}"]`);
    if (altThemeMetaTag.length > 0) {
      const content = altThemeMetaTag.attr('content');
      const themeVersion = extractVersion(content);
      if (themeVersion) {
        checkResult.valid = true;
        checkResult.label = themeVersion;
        return checkResult;
      }
    }
    
  } catch (error) {
    // 针对特定错误类型进行处理
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
  if (!config.theme_checker.enabled) {
    logger('info', 'Site checker is disabled in config');
    return;
  }

  try {
    const issueManager = new IssueManager();
    const validSites = await issueManager.getIssues({
      exclude_labels: config.theme_checker.exclude_labels,
      include_keyword: config.theme_checker.include_keyword
    });
    logger('info', `Total sites to check: ${validSites.length}`);
    let errors = [];
    
    // 创建并发控制池，最大并发数为 5
    const pool = new ConcurrencyPool(5);
    const checkPromises = validSites.map(item => {
      return pool.add(async () => {
        try {
          logger('info', `#${item.issue_number} Checking site: ${item.url}`);
          const checkSiteWithRetry = () => checkSite(item);
          const checkResult = await withRetry(checkSiteWithRetry, config.theme_checker.retry_times);
          
          let labels = [];
          if (checkResult.valid) {
            labels = [`${checkResult.label}`];
          } else {
            labels = [...(item.labels.map(label => label.name) || []), checkResult.label];
          }
          labels = [...new Set(labels)];
          await issueManager.updateIssueLabels(item.issue_number, labels);
          logger('info', `Finished checking site for issue #${item.issue_number}, checkResult: ${JSON.stringify(checkResult)}`);
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