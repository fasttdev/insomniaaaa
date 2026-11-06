// server.js
const express = require("express");
const path = require("path");

// Import dari folder _lib
const downloadHandler     = require("./api/_lib/download");
const stalkttHandler      = require("./api/_lib/stalktt");
const reqHandler          = require("./api/_lib/req");
const wainspectorHandler  = require("./api/_lib/wainspector");
const webtoapkHandler     = require("./api/_lib/webtoapk");
const bypassHandler       = require("./api/_lib/bypass");
const vtsearchHandler     = require("./api/_lib/vtsearch");
const pinterestHandler    = require("./api/_lib/pinterest");
const texttoimageHandler  = require("./api/_lib/texttoimage");
const playstoreHandler    = require("./api/_lib/playstore");
const googlesearchHandler = require("./api/_lib/googlesearch");
const igstalkerHandler    = require("./api/_lib/igstalker");
const facebookHandler     = require("./api/_lib/facebook");

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));

// ... (middleware block static & routes sama persis kayak sebelumnya, 
// cuma pastiin require-nya udah dari _lib)