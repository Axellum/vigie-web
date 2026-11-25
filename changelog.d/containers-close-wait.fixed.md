- Rented server: the API no longer loses a growing share of its new connections to its sources in the hours after a
  restart (1 to 2 % after four hours). The network of the containers forgot after 60 seconds a connection closed by
  the far end, then dropped the API's own late close; the API's unit now sets that delay to a day at each start.
