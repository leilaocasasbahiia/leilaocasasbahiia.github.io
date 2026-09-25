"use strict";
const template = require("./store-template");
const withMetaPixel = require("./meta-pixel");
module.exports = Object.fromEntries(Object.entries(template).map(([name, render]) =>
  [name, (...args) => withMetaPixel(render(...args))]
));
