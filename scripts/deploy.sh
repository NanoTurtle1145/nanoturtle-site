#!/usr/bin/env bash
# 构建并发布到 GitHub Pages（gh-pages 分支）
set -e
cd "$(dirname "$0")/.."

REMOTE="${DEPLOY_REMOTE:-git@github.com:NanoTurtle1145/nanoturtle-site.git}"

echo "==> 构建"
npm run build

echo "==> 组装发布目录"
rm -rf .deploy
mkdir -p .deploy
cp -a public/. .deploy/
printf 'www.nanoturtle.cn\n' > .deploy/CNAME
touch .deploy/.nojekyll

echo "==> 推送 gh-pages"
cd .deploy
git init -q
git checkout -q -b gh-pages
git add -A
git -c user.name="NanoTurtle1145" -c user.email="198453844+NanoTurtle1145@users.noreply.github.com" \
    commit -q -m "deploy: $(date '+%Y-%m-%d %H:%M:%S')"
git push -f "$REMOTE" gh-pages
cd ..
rm -rf .deploy
echo "==> 完成 https://www.nanoturtle.cn/"
