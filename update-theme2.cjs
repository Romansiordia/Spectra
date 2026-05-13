const fs = require('fs');
const replacements = [
  { match: /\bborder-slate-800\b/g, replace: 'border-ui-border' }
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
