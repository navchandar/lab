# 🏭 Company Data

This script is designed to gather and visualize company data from public sources and compile it into a structured format.

## Features

1. **Fetch Company URLs**: The script fetches a list of jobs from LinkedIn
2. **Extract Company Data**: For each company, it fetches website link, LinkedIn link, employee count.
3. **Store Data**: The collected data is stored in a JSON file for visualization.
4. **Compare Employee Count**: The script compares the change in employee count with previous data.
5. **Visualize Data**: It visualizes the change in employee count over time for each company.

## Usage

```
pip install curl-cffi beautifulsoup4
python company_data_parser.py
```

## NOTE:

- Data may not be accurate or up-to-date.
