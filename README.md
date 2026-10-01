# Covid-Data

Six COVID-19 indicator signals for all 50 US states and DC, June 2020 to March 2022,
collected from the [Delphi Epidata API](https://cmu-delphi.github.io/delphi-epidata/)
at Carnegie Mellon University.

This file exists so that a classroom can load the data in one download. The Delphi
API allows only 60 requests per hour per internet address, and a school network
usually shares one address, so sending every student to the API does not work.

## The file

`covid_signals_by_state.csv` has one row per state per day:

| Column | Kind of data | What it measures |
|---|---|---|
| `state` | | Two-letter postal code |
| `date` | | Day, from 2020-06-01 to 2022-03-31 |
| `searches` | Online behavior | Google searches for loss of smell or taste (`google-symptoms`) |
| `survey` | Social media survey | % of Facebook survey takers reporting COVID-like illness (`fb-survey`) |
| `doctor` | Insurance claims | % of doctor visits for COVID-like illness (`doctor-visits`) |
| `cases` | Lab testing | New positive tests per 100,000 people, 7-day average (`jhu-csse`) |
| `hospital` | Hospital reports | New COVID hospital admissions per 100,000 people (`hhs`) |
| `deaths` | Death records | COVID deaths per 100,000 people, 7-day average (`jhu-csse`) |

Blank cells mean no data was reported, not zero. The `searches` signal is missing
entirely for eight smaller states (AK, DC, DE, MT, ND, SD, VT, WY), because Google
suppresses low-volume counts, and it stops in January 2022.

Territories (AS, GU, MP, PR, VI) are present in the file but have very sparse coverage.

## Direct address for code

```
https://raw.githubusercontent.com/haile-teshome/Covid-Data/main/covid_signals_by_state.csv
```

```python
import pandas as pd
data = pd.read_csv(
    "https://raw.githubusercontent.com/haile-teshome/Covid-Data/main/covid_signals_by_state.csv",
    parse_dates=["date"])
```

## Source and credit

Assembled from the Delphi Epidata API, which gathered these signals from Google,
Facebook/Meta, health systems, Johns Hopkins University, and the US Department of
Health and Human Services. Please cite Delphi if you use this data. The signal
definitions are documented in the
[covidcast signal catalogue](https://cmu-delphi.github.io/delphi-epidata/api/covidcast_signals.html).
