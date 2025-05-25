import { Octokit } from '@octokit/rest';
import path from 'path';
import { config } from '../config.js';
import { logger, handleError, writeJsonToFile } from './utils.js';
import fetch from 'node-fetch';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
  request: { fetch }
});

async function getIssues() {
  const [owner, repo] = (config.base.debug_repo || process.env.GITHUB_REPOSITORY).split('/');
  const params = {
    owner,
    repo,
    state: 'open',
    per_page: 100
  };

  // 添加排序
  params.sort = config.generator.sort;
  params.direction = config.generator.direction;

  try {
    const issues = [];
    for await (const response of octokit.paginate.iterator(octokit.issues.listForRepo, params)) {
      issues.push(...response.data);
    }
    
    // 过滤黑名单标签的 issues
    const blacklistLabels = [
      ...(config.generator.exclude_labels || []),
      ...Object.values(config.base.invalid_labels || {})
    ];
    logger('info', `Filtering issues with blacklist labels: ${blacklistLabels.join(', ')}`);
    const filteredIssues = issues.filter(issue => {
      const issueLabels = issue.labels.map(label => label.name);
      return !blacklistLabels.some(blacklistLabel => issueLabels.includes(blacklistLabel));
    });
    
    return filteredIssues;
  } catch (error) {
    handleError(error, 'Error fetching issues');
    throw error;
  }
}

async function processIssue(issue) {
  try {
    logger('info', `Processing issue #${issue.number}`);
    if (!issue.body) {
      logger('warn', `Issue #${issue.number} has no body content, skipping...`);
      return null;
    }

    const match = issue.body.match(/```json\s*\{[\s\S]*?\}\s*```/m);
    const jsonMatch = match ? match[0].match(/\{[\s\S]*?\}/m) : null;

    if (!jsonMatch) {
      logger('warn', `No JSON content found in issue #${issue.number}`);
      return null;
    }

    logger('info', `Found JSON content in issue #${issue.number}`);
    const jsonData = JSON.parse(jsonMatch[0]);
    jsonData.issue_number = issue.number;
    jsonData.labels = issue.labels.map(label => ({
      name: label.name,
      color: label.color
    }));
    
    return jsonData;
  } catch (error) {
    handleError(error, `Error processing issue #${issue.number}`);
    return null;
  }
}

async function parseIssues() {
  if (!config.generator.enabled) {
    logger('info', 'Issue parser is disabled in config');
    return;
  }

  try {
    const issues = await getIssues();
    logger('info', `Found ${issues.length} issues to process`);

    const parsedData = {
      version: config.base.data_version,
      content: []
    };

    // 对 issues 进行版本号排序
    const sortedIssues = issues.sort((a, b) => {
      const getVersionLabel = (issue) => {
        const versionLabel = issue.labels.find(label => /^\d+\.\d+\.\d+$/.test(label.name));
        return versionLabel ? versionLabel.name : '0.0.0';
      };
      const versionA = getVersionLabel(a).split('.').map(Number);
      const versionB = getVersionLabel(b).split('.').map(Number);
      for (let i = 0; i < 3; i++) {
        if (versionA[i] !== versionB[i]) {
          return versionB[i] - versionA[i];
        }
      }
      return 0;
    });

    for (const issue of sortedIssues) {
      const processedData = await processIssue(issue);
      if (processedData) {
        parsedData.content.push(processedData);
      }
    }

    const outputPath = path.join(process.cwd(), config.base.paths.data);
    if (writeJsonToFile(outputPath, parsedData)) {
      logger('info', 'Successfully generated v2/data.json');
    }

  } catch (error) {
    handleError(error, 'Error processing issues');
    process.exit(1);
  }
}

parseIssues();
