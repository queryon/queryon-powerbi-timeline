# Install
npm install
npm install -g powerbi-visuals-tools

# Install Cert
https://microsoft.github.io/PowerBI-visuals/docs/quickstarts_old/add-certificate-windows/
`pbiviz --install-cert`
Make sure to grab the Passphrase from the Terminal.
Place the cert in `Current User`
Install `Trusted Root Certification Authorities`

# Running
`pbiviz start`

# This command fixes any webpack errors
`npm install --save-dev webpack` 
# This command fixes and d3/event errors
`npm i @types/d3` 
# This command dixes any "field Browser" Errors
`npm install --save-dev process` 