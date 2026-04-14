Get-ChildItem -Include *.html, *.css, *.js, *.py -Recurse -Exclude "node_modules" | Get-Content -ErrorAction SilentlyContinue | Out-File -FilePath combined_code.txt

PS C:\Users\mahip\HID_new> cd backend
PS C:\Users\mahip\HID_new\backend> node server.js

firebase deploy --only firestore:rules 