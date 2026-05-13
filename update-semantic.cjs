const fs = require('fs');

const replacements = [
  { match: /\btext-brand-600\b/g, replace: 'text-ui-accent' },
  { match: /\btext-brand-500\b/g, replace: 'text-ui-accent' },
  { match: /\btext-brand-400\b/g, replace: 'text-ui-accent' },
  { match: /\btext-brand-700\b/g, replace: 'text-ui-accent' },
  { match: /\btext-emerald-400\b/g, replace: 'text-ui-success' },
  { match: /\btext-emerald-500\b/g, replace: 'text-ui-success' },
  { match: /\btext-emerald-600\b/g, replace: 'text-ui-success' },
  { match: /\btext-rose-600\b/g, replace: 'text-red-500' },
  { match: /\btext-rose-500\b/g, replace: 'text-red-500' },
  { match: /\bbg-brand-500\b/g, replace: 'bg-ui-accent' },
  { match: /\bbg-brand-600\b/g, replace: 'bg-ui-accent' },
  { match: /\bbg-emerald-500\b/g, replace: 'bg-ui-success' },
  { match: /\bbg-emerald-600\b/g, replace: 'bg-ui-success' },
  { match: /\bbg-emerald-50\b/g, replace: 'bg-ui-success/10' },
  { match: /\bbg-red-50\b/g, replace: 'bg-red-500/10' },
  { match: /\bbg-brand-50\b/g, replace: 'bg-ui-accent/10' },
  { match: /\bborder-emerald-100\b/g, replace: 'border-ui-success/30' },
  { match: /\bborder-red-100\b/g, replace: 'border-red-500/30' },
  { match: /\bborder-brand-100\b/g, replace: 'border-ui-accent/30' },
  { match: /\btext-brand-900\b/g, replace: 'text-ui-accent' },
  { match: /\bbg-brand-900\b/g, replace: 'bg-ui-accent/10' },
  { match: /\bborder-brand-800\b/g, replace: 'border-ui-accent/20' }
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
console.log("Replaced semantic colors.");
