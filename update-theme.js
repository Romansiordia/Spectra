const fs = require('fs');

const replacements = [
  { match: /\bbg-white\b/g, replace: 'bg-ui-card' },
  { match: /\bborder-slate-100\b/g, replace: 'border-ui-border' },
  { match: /\bborder-slate-200\b/g, replace: 'border-ui-border' },
  { match: /\bbg-slate-50\b/g, replace: 'bg-ui-darkest' },
  { match: /\bbg-slate-100\b/g, replace: 'bg-ui-darkest' },
  { match: /\bbg-slate-900\b/g, replace: 'bg-ui-darkest' },
  { match: /\btext-slate-900\b/g, replace: 'text-slate-100' },
  { match: /\btext-slate-800\b/g, replace: 'text-slate-100' },
  { match: /\btext-slate-700\b/g, replace: 'text-slate-300' },
  { match: /\btext-slate-600\b/g, replace: 'text-slate-400' },
  { match: /\bbg-slate-800\b/g, replace: 'bg-ui-dark' },
  { match: /\bborder-slate-700\b/g, replace: 'border-ui-border' },
  { match: /\bg-brand-600\b/g, replace: 'bg-emerald-600 border border-emerald-500 hover:bg-emerald-500 shadow-md shadow-emerald-500/20' }
];

const files = fs.readdirSync('./components').map(f => './components/' + f).concat(['./App.tsx']);

files.forEach(file => {
  if (file.endsWith('.tsx')) {
    let content = fs.readFileSync(file, 'utf8');
    replacements.forEach(({match, replace}) => {
      content = content.replace(match, replace);
    });
    fs.writeFileSync(file, content, 'utf8');
  }
});
console.log("Replaced colors.");
