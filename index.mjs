#!/usr/bin/env node
import path from 'path';
import fs from 'fs';
import { downloadRepo, getData } from './utils.mjs';
import http from 'http';
import { exec } from 'child_process';
import os from 'os';
import net from 'net';
import pkg from 'enquirer';
const { prompt } = pkg;

const response = await prompt([
  {
    type: 'input',
    name: 'repoUrl',
    message: 'Enter the url of the repo to analyze',
    required: true
  },
  {
    type: 'input',
    name: 'daysAmount',
    message: 'Enter the number of days to consider',
    required: true
  },
  {
    type: 'input',
    name: 'branchName',
    message: 'Enter the name of the branch to consider',
    initial: 'main'
  },
  {
    type: 'select',
    name: 'outputFormat',
    message: 'Choose the output format',
    choices: ['json', 'html'],
    initial: 'json'
  }
]);

const { repoUrl, daysAmount, branchName, outputFormat } = response;

const tmpDir = path.join(os.tmpdir(), 'tmp-spyone');

const resultsDir = path.join(os.tmpdir(), 'results');

if (!repoUrl || !daysAmount) {
  console.error('Usage: npx @jointly/spyone <repo-url> <commit-count>');
  process.exit(1);
}

// Drop folder if exists
if (fs.existsSync(tmpDir)) {
  fs.rmdirSync(tmpDir, { recursive: true });
}

// Create the tmp directory
fs.mkdirSync(tmpDir);

// Download the repo
console.log('Downloading repo...');
await downloadRepo(repoUrl, tmpDir, branchName);

// Get the data
console.log('Getting data...');
let data = await getData(tmpDir, daysAmount);

// Sort data map by commitsCount, if equal sort by additions + deletions
data = new Map(
  [...data.entries()].sort((a, b) => {
    return (
      b[1].commitCount - a[1].commitCount ||
      b[1].additions + b[1].deletions - (a[1].additions + a[1].deletions)
    );
  })
);

// Create results directory if it doesn't exist
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir);
}

// Write the data to a file, consider data is a map
const today = new Date();
const resultsFileName = `${today.getFullYear()}-${
  today.getMonth() + 1
}-${today.getDate()}-${today.getHours()}-${today.getMinutes()}-${repoUrl
  .split('/')
  .pop()
  .replace('.git', '')}-${daysAmount}-${branchName}.json`;
const resultsFilePath = path.join(resultsDir, resultsFileName);
const fileContent = JSON.stringify([...data.entries()]);
fs.writeFileSync(resultsFilePath, fileContent);

// Drop tmp folder
if (fs.existsSync(tmpDir)) {
  fs.rmdirSync(tmpDir, { recursive: true });
}

const stats = [...data.entries()].reduce((prev, curr) => {
  // @todo: Improve this check
  if (Number.isNaN(prev + curr[1].additions + curr[1].deletions)) return prev;
  return prev + curr[1].additions + curr[1].deletions;
}, 0);

console.log(`Results saved to ${resultsFilePath}, total stats: ${stats}`);

const server = http.createServer(function (req, res) {
  fs.readFile(resultsFilePath, function (err, data) {
    if (err) throw err;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write(data);
    res.end();
  });
});

server.listen(9666, function () {
  console.log('Server running at http://localhost:9666/');
  console.log('Ctrl+c to exit');
  // open the URL in the default browser
  exec('open http://localhost:9666/');
});
