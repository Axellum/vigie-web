- The API container's health check asks the API's light `/v1/health/live` route once a minute instead of building the
  whole `/v1/health` report; an API without that route is still checked through `/v1/health`.
