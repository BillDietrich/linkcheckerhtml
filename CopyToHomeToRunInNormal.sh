#!/bin/bash

# copy files from development directory to user's normal extension
# directory, so they can be used in normal (not debug) VSCode

set -o verbose

NEWEXTSDIR=~/.vscode/extensions/linkcheckerhtml

rm -frIv $NEWEXTSDIR
mkdir $NEWEXTSDIR

cp linkcheckerhtmlicon.jpeg $NEWEXTSDIR
cp LICENSE.md $NEWEXTSDIR
cp -r node_modules $NEWEXTSDIR
cp -r out $NEWEXTSDIR
cp package.json $NEWEXTSDIR
cp README.md $NEWEXTSDIR

