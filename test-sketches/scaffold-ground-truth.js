#!/usr/bin/env node
// Creates a blank ground-truth template for every image that doesn't have one,
// so you only have to fill in the numbers you've verified — not build files from
// scratch. Never overwrites an existing ground-truth file.
const fs = require('fs');
const path = require('path');

const IMAGES_DIR = path.join(__dirname, 'images');
const TRUTH_DIR = path.join(__dirname, 'ground-truth');
const EXTS = ['.png', '.jpg', '.jpeg', '.webp'];

fs.mkdirSync(TRUTH_DIR, { recursive: true });

const template = {
  _comment: 'Fill in only the fields you have hand-verified against the drawing. Delete any you cannot verify — omitted fields are skipped in scoring, not counted as misses. Set "dimensioned" true if the drawing has dimension lines or a stated scale — this drives the dimensioned-vs-unscaled accuracy split.',
  dimensioned: null,
  total_footprint_sqm: null,
  unit_count: null,
  room_count: null,
  door_count: null,
  window_count: null,
  plot_width_m: null,
  plot_depth_m: null,
  plot_area_sqm: null,
  setback_front_m: null,
  setback_rear_m: null,
  setback_side_m: null,
  building_height_m: null,
  floor_count: null
};

const images = fs.existsSync(IMAGES_DIR)
  ? fs.readdirSync(IMAGES_DIR).filter((f) => EXTS.includes(path.extname(f).toLowerCase()))
  : [];

let created = 0;
images.forEach((img) => {
  const base = path.basename(img, path.extname(img));
  const out = path.join(TRUTH_DIR, base + '.json');
  if (fs.existsSync(out)) return;
  fs.writeFileSync(out, JSON.stringify(template, null, 2) + '\n');
  console.log('created ground-truth/' + base + '.json');
  created++;
});

if (!images.length) console.log('No images in test-sketches/images/ yet.');
else if (!created) console.log('Every image already has a ground-truth file. Nothing to do.');
else console.log('\n' + created + ' template(s) created — open them and fill in verified values.');
