# Health of the Vigie API inside its container: exit 0 when it answers 2xx, 1 otherwise.
# /v1/health/live answers at once without reading the sources; /v1/health builds the whole report (about 70 ms) and is
# kept for an API older than that route (it answers 404 there).
import urllib.error
import urllib.request

try:
    urllib.request.urlopen("http://127.0.0.1:8080/v1/health/live", timeout=4)
except urllib.error.HTTPError as error:
    if error.code != 404:
        raise
    urllib.request.urlopen("http://127.0.0.1:8080/v1/health", timeout=4)
