# Health of the Vigie API inside its container: exit 0 when /v1/health answers 2xx, 1 otherwise.
import urllib.request

urllib.request.urlopen("http://127.0.0.1:8080/v1/health", timeout=4)
