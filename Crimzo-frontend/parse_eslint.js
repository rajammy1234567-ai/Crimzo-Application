const fs = require('fs');
try {
  const content = fs.readFileSync('eslint_report.json', 'utf16le');
  let data;
  try {
     data = JSON.parse(content);
  } catch(e) {
     // fallback if it's utf8
     data = JSON.parse(fs.readFileSync('eslint_report.json', 'utf8'));
  }
  
  let errors = [];
  data.forEach(f => {
    f.messages.forEach(m => {
      if (m.severity === 2) { // 2 means error
        const shortPath = f.filePath.split('Crimzo-frontend\\\\')[1] || f.filePath;
        errors.push(`${shortPath}:${m.line} - ${m.message}`);
      }
    });
  });
  console.log(errors.length > 0 ? errors.join('\n') : 'No errors!');
} catch(err) {
  console.error("Failed to parse", err);
}
