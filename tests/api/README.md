# API Test Collections

- Import `collections/staging.postman_collection.json` and `environments/staging.postman_environment.json` into Postman.
- Use Newman in CI:
  ```
  newman run collections/staging.postman_collection.json \
    -e environments/staging.postman_environment.json \
    --reporters cli,junit --reporter-junit-export ../../reports/newman.xml
  ```
- Keep test data aligned with staging seed fixtures.

