# Bug Report

##

### 1. Incorrect redirect

For the following URL:

http://localhost:3000/search?returntype=all-entities&querytype=AND&search=%22Warsaw+Academy+of+Medical+Rehabilitation%22

We expect to see regular screen not redirect to the services (choices) website.

http://localhost:3000/services/search?returntype=all-entities&querytype=AND&search=%22Warsaw+Academy+of+Medical+Rehabilitation%22