#!/usr/bin/env bash

for markdown in ./mds/*.md; do
  name=$(basename -s ".md" ${markdown})
  pandoc -t asciidoc -f markdown ${markdown} > ./mds/${name}.txt
done
