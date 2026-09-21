import { marked } from 'marked'
const src = [
  "| a | b |\n|---|---|\n| 1 | 2 |\n\n\n",
  "- outer\n  - inner one\n  - inner two\n\n    para in inner\n- outer 2\n\n\n",
  "1. one\n2. two\n\n   loose\n\n\n",
  "- [ ] todo\n- [x] done\n\n",
  "<div class=\"x\">raw <b>html</b></div>\n\n\ntext after\n\n",
  "```\ncode\n\n\n```\n\n\n",
  "Line one  \nline two\n\n---\n\n> q1\n>\n> q2\n\n\n",
  "![img](http://x/y.png) [link](http://x) `code` **b** _i_\n\n\n",
].join('')
const out = marked(src)
const enc = new TextEncoder()
const buf = await crypto.subtle.digest('SHA-256', enc.encode(out))
console.log('len', out.length, 'sha', Array.from(new Uint8Array(buf)).slice(0,8).map(b=>b.toString(16).padStart(2,'0')).join(''))
console.log(JSON.stringify(out))
