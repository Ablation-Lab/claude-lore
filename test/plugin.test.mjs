// The Claude Code plugin manifest and the marketplace entry that points at it. Run with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = (rel) => JSON.parse(fs.readFileSync(path.join(repo, rel), 'utf8'));

test('plugin.json, the marketplace entry and the skill agree', () => {
  const plugin = json('.claude-plugin/plugin.json');
  const market = json('.claude-plugin/marketplace.json');
  const skill = fs.readFileSync(path.join(repo, 'skills', 'lore-lookup', 'SKILL.md'), 'utf8');
  assert.equal(plugin.name, 'lore-lookup');
  assert.match(skill, /^---\r?\nname: lore-lookup\r?\n/);
  assert.equal(market.plugins.length, 1);
  assert.equal(market.plugins[0].name, plugin.name);
  assert.equal(market.plugins[0].source, './');
  assert.equal(market.plugins[0].version, plugin.version); // raise both with every release
  assert.equal(plugin.license, 'MIT');
});

test('the plugin has a square icon of at least 512 px, as the plugin directory asks', () => {
  const png = fs.readFileSync(path.join(repo, '.claude-plugin', 'icon.png'));
  assert.equal(png.toString('latin1', 1, 4), 'PNG');
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
  assert.equal(w, h);
  assert.ok(w >= 512 && w <= 2048, `${w} px`);
  assert.ok(png.length < 2 * 1024 * 1024);
});

test('the plugin adds no hook of its own: the daily hook stays opt-in through the installer', () => {
  assert.equal(fs.existsSync(path.join(repo, 'hooks', 'hooks.json')), false);
  assert.equal(json('.claude-plugin/plugin.json').hooks, undefined);
});
