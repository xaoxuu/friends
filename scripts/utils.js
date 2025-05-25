import fs from 'fs';
import path from 'path';
import { Octokit } from '@octokit/rest';
import { config } from '../config.js';

export function logger(level, message, ...args) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, ...args);
}

export function handleError(error, context) {
  if (error.response) {
    logger('error', `${context}: ${error.response.status} - ${error.response.statusText}`);
  } else if (error.request) {
    logger('error', `${context}: No response received`);
  } else {
    logger('error', `${context}: ${error.message}`);
  }
}

export function writeJsonToFile(filePath, data) {
  try {
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    handleError(error, `Error writing to file ${filePath}`);
    return false;
  }
}

export async function withRetry(fn, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

export class ConcurrencyPool {
  constructor(maxConcurrency) {
    this.maxConcurrency = maxConcurrency;
    this.running = 0;
    this.queue = [];
  }

  async add(fn) {
    if (this.running >= this.maxConcurrency) {
      await new Promise(resolve => this.queue.push(resolve));
    }
    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        next();
      }
    }
  }
}

export class IssueManager {
  constructor() {
    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN
    });
  }

  async getIssues(filterConfig) {
    const [owner, repo] = (config.base.debug_repo || process.env.GITHUB_REPOSITORY).split('/');
    
    try {
      const issues = [];
      for await (const response of this.octokit.paginate.iterator(this.octokit.issues.listForRepo, {
        owner,
        repo,
        state: 'open',
        per_page: 100
      })) {
        issues.push(...response.data);
      }
      
      // 过滤掉包含 exclude_labels 中定义的标签的 Issue
      const filteredIssues = issues.filter(issue => {
        const issueLabels = issue.labels.map(label => label.name);
        return !filterConfig.exclude_labels.some(excludeLabel => issueLabels.includes(excludeLabel));
      });

      // 根据 include_keyword 过滤 Issue
      const keywordFilteredIssues = filteredIssues.filter(issue => {
        if (!filterConfig.include_keyword) return true;
        return issue.body?.includes(filterConfig.include_keyword);
      });
      
      return keywordFilteredIssues.map(issue => ({
        url: issue.body?.match(/"url":\s*"([^"]+)"/)?.at(1),
        issue_number: issue.number,
        labels: issue.labels.map(label => ({
          name: label.name,
          color: label.color
        }))
      })).filter(item => item.url);
    } catch (error) {
      handleError(error, 'Error fetching issues');
      throw error;
    }
  }

  async updateIssueLabels(issueNumber, labels) {
    const [owner, repo] = (config.base.debug_repo || process.env.GITHUB_REPOSITORY).split('/');
    try {
      await this.octokit.issues.setLabels({
        owner,
        repo,
        issue_number: issueNumber,
        labels
      });
      logger('info', `Updated labels for issue #${issueNumber}`, labels);
    } catch (error) {
      handleError(error, `Error updating labels for issue #${issueNumber}`);
    }
  }
}