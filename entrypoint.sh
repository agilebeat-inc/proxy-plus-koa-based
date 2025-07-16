#!/bin/sh
if [ "$1" = "version" ]; then
  node --version
else
  # Default: start the server
  node app.js
fi