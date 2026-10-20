# Data

`places.tsv.gz`: the places the "near me" page can search by name, built by `scripts/build-places.mjs` from
two files of the [GeoNames](https://www.geonames.org/) dump (`cities500.zip` and `admin1CodesASCII.txt`,
<https://download.geonames.org/export/dump/>), downloaded on 20 October 2026. GeoNames data is under the
[Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/) licence; the file keeps only
the name, the other names in the Latin script of the places of 100,000 people or more, the country, the
region, the position and the population.

One line per place, tab-separated: name, other names (separated by `|`), country (ISO 3166-1 alpha-2),
region, latitude, longitude, population.
