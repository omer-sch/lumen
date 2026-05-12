# Lumen Data Layer — Build Plan
Generated: 2026-05-11T11:18:37.274Z

Single source of truth for the BigQuery → Lumen data layer. All
schemas below are read from `INFORMATION_SCHEMA` of
`yellowhead-visionbi-rivery.yellowhead_prod` at the time stamped above — no assumed names.

---

## 1. Target schema — `lumen_agent`

One partitioned, clustered fact table. All clients, all platforms, one
row per (date, client, network, campaign, adset). Lumen always reads
with `WHERE client = '<slug>' AND date BETWEEN …` so the partition
prune + cluster skip keeps cost flat as we add clients.

```sql
CREATE TABLE `yellowhead-visionbi-rivery.yellowhead_prod.lumen_agent` (
  date           DATE      NOT NULL,
  client         STRING    NOT NULL,
  network        STRING    NOT NULL,
  campaign_id    STRING,
  campaign_name  STRING,
  adset_id       STRING,
  adset_name     STRING,
  spend_usd      FLOAT64,
  impressions    INT64,
  clicks         INT64,
  installs       INT64,
  revenue_usd    FLOAT64,
  roas           FLOAT64,   -- materialized = revenue_usd / NULLIF(spend_usd, 0)
  cpi            FLOAT64,   -- materialized = spend_usd / NULLIF(installs, 0)
  ctr            FLOAT64    -- materialized = clicks / NULLIF(impressions, 0)
)
PARTITION BY date
CLUSTER BY client, network;
```

**Per-platform NULL expectations** (inferred from Phase 3 mapping below):
- `installs` / `revenue_usd` will be NULL for clients where Meta is
  the only source and there is no AppsFlyer/Adjust table — same
  pattern as Playw3 today.
- `adset_id` / `adset_name` may be NULL for AppsFlyer-origin rows
  (AppsFlyer reports at the campaign level, not adset).
- `roas` / `cpi` / `ctr` are stored, not virtual — recompute at
  ETL time so reads do no math.

---

## 2. Target schema — `lumen_clients`

```sql
CREATE TABLE `yellowhead-visionbi-rivery.yellowhead_prod.lumen_clients` (
  slug      STRING    NOT NULL,   -- url-safe slug used by Lumen's ALLOWED_CLIENTS
  name      STRING    NOT NULL,   -- display name
  vertical  STRING,               -- gaming | ecommerce | fintech | health | other
  networks  ARRAY<STRING>,        -- subset of ('Meta','TikTok','Google','AppsFlyer','Adjust','Apple')
  active    BOOL      NOT NULL DEFAULT TRUE,
  added_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);
```

**Initial rows** (all clients with Meta + at least one attribution
source — discovered in Phase 2 below). Vertical is left NULL until
Omer fills it in:

```sql
INSERT INTO `yellowhead-visionbi-rivery.yellowhead_prod.lumen_clients` (slug, name, networks, active) VALUES
  ('appreel', 'appreel', ['AppsFlyer', 'Meta', 'TikTok'], TRUE),
  ('baby_tv', 'baby_tv', ['Apple', 'AppsFlyer', 'Google', 'Meta'], TRUE),
  ('block_puzzle', 'block_puzzle', ['AppsFlyer', 'Google', 'Meta'], TRUE),
  ('coreloop', 'coreloop', ['Apple', 'AppsFlyer', 'Google', 'Meta', 'TikTok'], TRUE),
  ('kingdom_maker', 'kingdom_maker', ['Adjust', 'Apple', 'Google', 'Meta', 'TikTok'], TRUE),
  ('metalstorm', 'metalstorm', ['Adjust', 'Apple', 'Google', 'Meta', 'TikTok'], TRUE),
  ('mundo_slots', 'mundo_slots', ['Apple', 'AppsFlyer', 'Google', 'Meta', 'TikTok'], TRUE),
  ('obsidian_knight', 'obsidian_knight', ['Adjust', 'Google', 'Meta', 'TikTok'], TRUE);
```

---

## 3. Platform coverage in the warehouse

Parsed 1903 `dwh_*` tables.
- Recognized as `<platform>_<client>`: **976**
- Unparsed (no recognized platform token): 927
- Distinct clients found: **554**

### 3a. Clients per platform

| platform | client_count | clients (sample) |
|---|---|---|
| Meta | 259 | 100play, 2k, 302_slingo_arcade, 88_fortune, Brix_Blast_Friends, aaptiv, … |
| TikTok | 67 | 2k, 88_fortune, a1, adgroup, age_winner_winner, appreel, … |
| Google | 165 | aaptiv, adventure_tales, adwords, adwords_Lumi, adwords_Lumi_analytics, adwords_Lumi_analytics_keywords, … |
| AppsFlyer | 6 | appreel, baby_tv, block_puzzle, columns_gett, coreloop, mundo_slots |
| Adjust | 3 | kingdom_maker, metalstorm, obsidian_knight |
| Apple | 61 | 2k_nba, baby_tv, barca, bbae, bingo_bash, bookful, … |
| Twitter | 4 | branch, playw3, simply_piano, super_draft |
| Snapchat | 2 | caesars_casino, pampers_us |
| Singular | 2 | metalstorm, superbloom_venue |
| AppTweak | 141 | 2k_nba, archer, barca, barcamobile, buzzrx, call_of_duty, … |
| Reddit | 7 | comparison, geo, last_7d, month, quarterly, worlwide, … |
| LinkedIn | 6 | aaptiv, anchor, inabit, mindspace, specops, yellowhead |
| Pinterest | 1 | just_spices |

### 3b. Viable clients for a full KPI dashboard

Definition: has `dwh_fb2_*` (Meta spend) **and** at least one of
AppsFlyer / Adjust / Kochava (install attribution).

**Count: 8**

| client | platforms |
|---|---|
| `appreel` | AppsFlyer, Meta, TikTok |
| `baby_tv` | Apple, AppsFlyer, Google, Meta |
| `block_puzzle` | AppsFlyer, Google, Meta |
| `coreloop` | Apple, AppsFlyer, Google, Meta, TikTok |
| `kingdom_maker` | Adjust, AppTweak, Apple, Google, Meta, TikTok |
| `metalstorm` | Adjust, AppTweak, Apple, Google, Meta, Singular, TikTok |
| `mundo_slots` | Apple, AppsFlyer, Google, Meta, TikTok |
| `obsidian_knight` | Adjust, Google, Meta, TikTok |

### 3c. Clients with Meta spend but no install source

These will land in `lumen_agent` with `installs` / `revenue_usd` NULL
(spend-only). Phase 1 of onboarding can still ship a dashboard for them.

**Count: 251**

| client | platforms |
|---|---|
| `100play` | Meta |
| `2k` | Meta, TikTok |
| `302_slingo_arcade` | Meta |
| `88_fortune` | Meta, TikTok |
| `Brix_Blast_Friends` | Meta |
| `aaptiv` | Google, LinkedIn, Meta |
| `abradoodle` | Meta |
| `adventure_tales` | Google, Meta |
| `age_gender` | Meta |
| `age_gender_adventure_tales` | Meta |
| `age_gender_california_psychics` | Meta |
| `age_gender_canopy` | Meta |
| `age_gender_curve` | Meta |
| `age_gender_high_roller` | Meta |
| `age_gender_makeship` | Meta |
| `age_gender_news_gpt` | Meta |
| `age_gender_ryze_beyond` | Meta |
| `age_gender_seacret` | Meta |
| `age_gender_stardust_casino` | Meta |
| `always_discreet` | Meta |
| `always_discreet_de` | Meta |
| `always_discreet_us` | Meta |
| `always_us` | Meta |
| `anchor` | LinkedIn, Meta |
| `antidote` | Meta |
| `appsflyer_100play` | Meta |
| `appsflyer_antidote` | Meta |
| `appsflyer_brix_blast_friend` | Meta |
| `appsflyer_high_roller` | Meta |
| `appsflyer_keno` | Meta |

_… and 221 more._

### 3d. Clients with no Meta presence

These are not blocked from Lumen, but the MVP rollout (which assumes
Meta is the spend anchor) won't cover them.

**Count: 295**

---

## 4. Column mapping per platform

For each platform we sampled the primary (shortest-name) `dwh_*` table
per client, diffed columns, and recorded which name maps to each
`lumen_agent` slot.

### Meta (fb2)

**Sample tables compared (5):**

- `dwh_fb2_globalcomix`
- `dwh_fb2_100play`
- `dwh_fb2_playw3`
- `dwh_clients_facebook_bingo_bash`
- `dwh_curve_fb2_google_asa_appsflyer`

| table | date | campaign_id | spend | impressions | clicks | installs | revenue | network |
|---|---|---|---|---|---|---|---|---|
| `dwh_fb2_globalcomix` | date | campaign_id | cost_usd | impressions | clicks | installs | rev_gross_d0_usd | Network |
| `dwh_fb2_100play` | date | campaign_id | cost_usd | impressions | clicks | installs | rev_gross_d0_usd | Network |
| `dwh_fb2_playw3` | date | campaign_id | cost_usd | impressions | clicks | installs | rev_gross_d0_usd | Network |
| `dwh_clients_facebook_bingo_bash` | date | campaign_id | cost_usd | impressions | clicks | installs | rev_d0_usd | media_source |
| `dwh_curve_fb2_google_asa_appsflyer` | date | campaign_id | cost_usd | impressions | clicks | — | revenue | — |

**Common columns (present in all 5 tables):** 16

```
ad_id, ad_name, ad_status, adset_id, adset_name, adset_status, campaign_id, campaign_status, clicks, cost_usd, daily_budget, date, impressions, master_account, master_account_id, os
```

**Divergent columns:** 755 total — showing top 30 by presence count.

| column | present in |
|---|---|
| `account_name` | fb2_globalcomix, fb2_100play, fb2_playw3, curve_fb2_google_asa_appsflyer |
| `ad_post_url` | fb2_globalcomix, fb2_100play, fb2_playw3, curve_fb2_google_asa_appsflyer |
| `ad_thumbnail_url` | fb2_globalcomix, fb2_100play, fb2_playw3, curve_fb2_google_asa_appsflyer |
| `adset_start_time` | fb2_globalcomix, fb2_100play, fb2_playw3, clients_facebook_bingo_bash |
| `body` | fb2_globalcomix, fb2_100play, fb2_playw3, clients_facebook_bingo_bash |
| `breakdown_type` | fb2_globalcomix, fb2_100play, fb2_playw3, curve_fb2_google_asa_appsflyer |
| `breakdown_value` | fb2_globalcomix, fb2_100play, fb2_playw3, curve_fb2_google_asa_appsflyer |
| `call_to_action_type` | fb2_globalcomix, fb2_100play, fb2_playw3, clients_facebook_bingo_bash |
| `campagin_name` | fb2_globalcomix, fb2_100play, fb2_playw3, curve_fb2_google_asa_appsflyer |
| `campaign_start_time` | fb2_globalcomix, fb2_100play, fb2_playw3, clients_facebook_bingo_bash |
| `cost_by_account` | fb2_globalcomix, fb2_100play, fb2_playw3, curve_fb2_google_asa_appsflyer |
| `cost_plus_fee` | fb2_globalcomix, fb2_100play, fb2_playw3, curve_fb2_google_asa_appsflyer |
| `creative_id` | fb2_globalcomix, fb2_100play, fb2_playw3, clients_facebook_bingo_bash |
| `creative_name` | fb2_globalcomix, fb2_100play, fb2_playw3, clients_facebook_bingo_bash |
| `creative_title` | fb2_globalcomix, fb2_100play, fb2_playw3, clients_facebook_bingo_bash |
| `creative_type` | fb2_globalcomix, fb2_100play, fb2_playw3, clients_facebook_bingo_bash |
| `currency` | fb2_globalcomix, fb2_100play, fb2_playw3, clients_facebook_bingo_bash |
| `customer` | fb2_globalcomix, fb2_100play, fb2_playw3, clients_facebook_bingo_bash |
| `customer_id` | fb2_globalcomix, fb2_100play, fb2_playw3, clients_facebook_bingo_bash |
| `effective_object_story_id` | fb2_globalcomix, fb2_100play, fb2_playw3, clients_facebook_bingo_bash |
| `ev_12m_net_midpoint` | fb2_globalcomix, fb2_100play, fb2_playw3, clients_facebook_bingo_bash |
| `frequency` | fb2_globalcomix, fb2_100play, fb2_playw3, clients_facebook_bingo_bash |
| `image_hash` | fb2_globalcomix, fb2_100play, fb2_playw3, clients_facebook_bingo_bash |
| `image_url` | fb2_globalcomix, fb2_100play, fb2_playw3, clients_facebook_bingo_bash |
| `instagram_permalink_url` | fb2_globalcomix, fb2_100play, fb2_playw3, clients_facebook_bingo_bash |
| `installs` | fb2_globalcomix, fb2_100play, fb2_playw3, clients_facebook_bingo_bash |
| `is_instagram_url` | fb2_globalcomix, fb2_100play, fb2_playw3, clients_facebook_bingo_bash |
| `num_ftd_all` | fb2_globalcomix, fb2_100play, fb2_playw3, clients_facebook_bingo_bash |
| `num_ftd_lifetime` | fb2_globalcomix, fb2_100play, fb2_playw3, clients_facebook_bingo_bash |
| `num_ftd_mtd` | fb2_globalcomix, fb2_100play, fb2_playw3, clients_facebook_bingo_bash |

_… and 725 more divergent columns — 518 of them present in only one sampled table (likely client-specific event counters or custom breakdowns)._

**Notes:** Meta is the spend anchor. The `spend` / `cost` column-name divergence below is the main fork to resolve.

### AppsFlyer

**Sample tables compared (4):**

- `dwh_appsflyer_patners_by_date_baby_tv`
- `dwh_play_appsflyer_columns_gett`
- `dwh_uni_appsflyer_appreel`
- `dwh_uni_appsflyer_block_puzzle`

| table | date | campaign_id | spend | impressions | clicks | installs | revenue | network |
|---|---|---|---|---|---|---|---|---|
| `dwh_appsflyer_patners_by_date_baby_tv` | date | — | — | — | — | installs | — | media_source |
| `dwh_play_appsflyer_columns_gett` | date | — | — | — | — | — | — | — |
| `dwh_uni_appsflyer_appreel` | date | campaign_id | cost_usd | impressions | clicks | installs | — | — |
| `dwh_uni_appsflyer_block_puzzle` | date | campaign_id | cost_usd | impressions | clicks | installs | — | — |

**Common columns (present in all 4 tables):** 1

```
date
```

**Divergent columns:** 51 total — showing top 30 by presence count.

| column | present in |
|---|---|
| `installs` | appsflyer_patners_by_date_baby_tv, uni_appsflyer_appreel, uni_appsflyer_block_puzzle |
| `account_name` | uni_appsflyer_appreel, uni_appsflyer_block_puzzle |
| `Activity` | uni_appsflyer_appreel, uni_appsflyer_block_puzzle |
| `ad_id` | uni_appsflyer_appreel, uni_appsflyer_block_puzzle |
| `ad_name` | uni_appsflyer_appreel, uni_appsflyer_block_puzzle |
| `ad_status` | uni_appsflyer_appreel, uni_appsflyer_block_puzzle |
| `adset_id` | uni_appsflyer_appreel, uni_appsflyer_block_puzzle |
| `adset_name` | uni_appsflyer_appreel, uni_appsflyer_block_puzzle |
| `adset_status` | uni_appsflyer_appreel, uni_appsflyer_block_puzzle |
| `app_id` | appsflyer_patners_by_date_baby_tv, play_appsflyer_columns_gett |
| `breakdown_type` | uni_appsflyer_appreel, uni_appsflyer_block_puzzle |
| `breakdown_value` | uni_appsflyer_appreel, uni_appsflyer_block_puzzle |
| `campaign_id` | uni_appsflyer_appreel, uni_appsflyer_block_puzzle |
| `campaign_name` | uni_appsflyer_appreel, uni_appsflyer_block_puzzle |
| `campaign_status` | uni_appsflyer_appreel, uni_appsflyer_block_puzzle |
| `clicks` | uni_appsflyer_appreel, uni_appsflyer_block_puzzle |
| `cost_original_currency` | uni_appsflyer_appreel, uni_appsflyer_block_puzzle |
| `cost_usd` | uni_appsflyer_appreel, uni_appsflyer_block_puzzle |
| `impressions` | uni_appsflyer_appreel, uni_appsflyer_block_puzzle |
| `master_account` | uni_appsflyer_appreel, uni_appsflyer_block_puzzle |
| `master_account_id` | uni_appsflyer_appreel, uni_appsflyer_block_puzzle |
| `max_page_post_url` | uni_appsflyer_appreel, uni_appsflyer_block_puzzle |
| `max_post_full_picture` | uni_appsflyer_appreel, uni_appsflyer_block_puzzle |
| `max_thumbnail_url` | uni_appsflyer_appreel, uni_appsflyer_block_puzzle |
| `os` | uni_appsflyer_appreel, uni_appsflyer_block_puzzle |
| `purchase_num_d0` | uni_appsflyer_appreel, uni_appsflyer_block_puzzle |
| `purchase_num_d1` | uni_appsflyer_appreel, uni_appsflyer_block_puzzle |
| `purchase_num_d14` | uni_appsflyer_appreel, uni_appsflyer_block_puzzle |
| `purchase_num_d3` | uni_appsflyer_appreel, uni_appsflyer_block_puzzle |
| `purchase_num_d30` | uni_appsflyer_appreel, uni_appsflyer_block_puzzle |

_… and 21 more divergent columns — 11 of them present in only one sampled table (likely client-specific event counters or custom breakdowns)._

**Notes:** Source of installs and (sometimes) revenue. Joined back to Meta on `(date, campaign_id)`.

### TikTok

**Sample tables compared (3):**

- `dwh_tik_tok_globalcomix`
- `dwh_mi_tik_tok_miila_hourly_campaigns`
- `dwh_mi_tik_tok_miila_hourly_channels`

| table | date | campaign_id | spend | impressions | clicks | installs | revenue | network |
|---|---|---|---|---|---|---|---|---|
| `dwh_tik_tok_globalcomix` | date | campaign_id | cost | impressions | clicks | conversion | — | — |
| `dwh_mi_tik_tok_miila_hourly_campaigns` | date | campaign_id | cost_usd | impressions | clicks | conversion | — | channel |
| `dwh_mi_tik_tok_miila_hourly_channels` | date | — | cost_usd | impressions | clicks | conversion | — | channel |

**Common columns (present in all 3 tables):** 8

```
breakdown_type, breakdown_value, clicks, conversion, date, impressions, master_account, master_account_id
```

**Divergent columns:** 48 total — showing top 30 by presence count.

| column | present in |
|---|---|
| `account_name` | mi_tik_tok_miila_hourly_campaigns, mi_tik_tok_miila_hourly_channels |
| `ad_client_id` | mi_tik_tok_miila_hourly_campaigns, mi_tik_tok_miila_hourly_channels |
| `ad_requests` | mi_tik_tok_miila_hourly_campaigns, mi_tik_tok_miila_hourly_channels |
| `campaign_id` | tik_tok_globalcomix, mi_tik_tok_miila_hourly_campaigns |
| `campaign_name` | tik_tok_globalcomix, mi_tik_tok_miila_hourly_campaigns |
| `campaign_status` | tik_tok_globalcomix, mi_tik_tok_miila_hourly_campaigns |
| `channel` | mi_tik_tok_miila_hourly_campaigns, mi_tik_tok_miila_hourly_channels |
| `clicks_spam` | mi_tik_tok_miila_hourly_campaigns, mi_tik_tok_miila_hourly_channels |
| `cost_usd` | mi_tik_tok_miila_hourly_campaigns, mi_tik_tok_miila_hourly_channels |
| `domain` | mi_tik_tok_miila_hourly_campaigns, mi_tik_tok_miila_hourly_channels |
| `earnings_eur` | mi_tik_tok_miila_hourly_campaigns, mi_tik_tok_miila_hourly_channels |
| `earnings_usd` | mi_tik_tok_miila_hourly_campaigns, mi_tik_tok_miila_hourly_channels |
| `individual_ad_impressions` | mi_tik_tok_miila_hourly_campaigns, mi_tik_tok_miila_hourly_channels |
| `lander_impressions` | mi_tik_tok_miila_hourly_campaigns, mi_tik_tok_miila_hourly_channels |
| `mail_clicks` | mi_tik_tok_miila_hourly_campaigns, mi_tik_tok_miila_hourly_channels |
| `matched_ad_requests` | mi_tik_tok_miila_hourly_campaigns, mi_tik_tok_miila_hourly_channels |
| `page_views` | mi_tik_tok_miila_hourly_campaigns, mi_tik_tok_miila_hourly_channels |
| `update_date` | mi_tik_tok_miila_hourly_campaigns, mi_tik_tok_miila_hourly_channels |
| `account_id` | tik_tok_globalcomix |
| `ad_id` | tik_tok_globalcomix |
| `ad_name` | tik_tok_globalcomix |
| `ad_status` | tik_tok_globalcomix |
| `add_to_wishlist` | tik_tok_globalcomix |
| `adgroup_budget` | tik_tok_globalcomix |
| `adgroup_budget_mode` | tik_tok_globalcomix |
| `adgroup_id` | tik_tok_globalcomix |
| `adgroup_name` | tik_tok_globalcomix |
| `adgroup_status` | tik_tok_globalcomix |
| `app_name` | tik_tok_globalcomix |
| `bid` | tik_tok_globalcomix |

_… and 18 more divergent columns — 18 of them present in only one sampled table (likely client-specific event counters or custom breakdowns)._

**Notes:** Second-tier spend source. Some clients have `dwh_tik_tok_*`, others `dwh_tiktok_*` — both patterns are picked up.

### Google Ads

**Sample tables compared (3):**

- `dwh_google_ads_globalcomix`
- `dwh_fact_adwords_web_ad_keyword_pampers_lumi`
- `dwh_fact_adwords_web_ad_keyword_yellowhead`

| table | date | campaign_id | spend | impressions | clicks | installs | revenue | network |
|---|---|---|---|---|---|---|---|---|
| `dwh_google_ads_globalcomix` | date | campaign_id | cost_usd | impressions | clicks | conversions | — | network |
| `dwh_fact_adwords_web_ad_keyword_pampers_lumi` | date | campaign_id | cost_usd | impressions | clicks | conversions | — | network |
| `dwh_fact_adwords_web_ad_keyword_yellowhead` | date | — | cost_usd | impressions | clicks | — | — | — |

**Common columns (present in all 3 tables):** 9

```
account_name, ad_id, ad_name, campaign_name, clicks, cost_usd, date, impressions, keyword
```

**Divergent columns:** 107 total — showing top 30 by presence count.

| column | present in |
|---|---|
| `budget_usd` | fact_adwords_web_ad_keyword_pampers_lumi, fact_adwords_web_ad_keyword_yellowhead |
| `campaign_id` | google_ads_globalcomix, fact_adwords_web_ad_keyword_pampers_lumi |
| `campaign_state` | fact_adwords_web_ad_keyword_pampers_lumi, fact_adwords_web_ad_keyword_yellowhead |
| `conversions` | google_ads_globalcomix, fact_adwords_web_ad_keyword_pampers_lumi |
| `country` | fact_adwords_web_ad_keyword_pampers_lumi, fact_adwords_web_ad_keyword_yellowhead |
| `device` | fact_adwords_web_ad_keyword_pampers_lumi, fact_adwords_web_ad_keyword_yellowhead |
| `master_account_id` | google_ads_globalcomix, fact_adwords_web_ad_keyword_pampers_lumi |
| `network` | google_ads_globalcomix, fact_adwords_web_ad_keyword_pampers_lumi |
| `os` | fact_adwords_web_ad_keyword_pampers_lumi, fact_adwords_web_ad_keyword_yellowhead |
| `placement` | fact_adwords_web_ad_keyword_pampers_lumi, fact_adwords_web_ad_keyword_yellowhead |
| `account` | google_ads_globalcomix |
| `activity` | fact_adwords_web_ad_keyword_yellowhead |
| `ad_group_name` | google_ads_globalcomix |
| `ad_group_status` | google_ads_globalcomix |
| `ad_labels` | fact_adwords_web_ad_keyword_pampers_lumi |
| `ad_state` | fact_adwords_web_ad_keyword_yellowhead |
| `ad_status` | google_ads_globalcomix |
| `AddToCartIntent` | fact_adwords_web_ad_keyword_pampers_lumi |
| `adgroup_id` | fact_adwords_web_ad_keyword_pampers_lumi |
| `adGroup_id` | google_ads_globalcomix |
| `adgroup_name` | fact_adwords_web_ad_keyword_pampers_lumi |
| `allConversions` | google_ads_globalcomix |
| `allConversions_1` | google_ads_globalcomix |
| `allConversions_10` | google_ads_globalcomix |
| `allConversions_11` | google_ads_globalcomix |
| `allConversions_2` | google_ads_globalcomix |
| `allConversions_3` | google_ads_globalcomix |
| `allConversions_4` | google_ads_globalcomix |
| `allConversions_5` | google_ads_globalcomix |
| `allConversions_6` | google_ads_globalcomix |

_… and 77 more divergent columns — 77 of them present in only one sampled table (likely client-specific event counters or custom breakdowns)._

**Notes:** Token is `adwords` or `google`. Some clients only have Apple Search Ads, not Google.


---

## 5. How `v_agent_globalcomix` was built (reference)

### Full schema (33 columns)

| column | type | nullable |
|---|---|---|
| `client` | STRING | YES |
| `network` | STRING | YES |
| `date` | DATE | YES |
| `campaign_id` | STRING | YES |
| `campaign_name` | STRING | YES |
| `campaign_status` | STRING | YES |
| `adset_id` | STRING | YES |
| `adset_name` | STRING | YES |
| `breakdown_value` | STRING | YES |
| `breakdown_type` | STRING | YES |
| `os` | STRING | YES |
| `cost_usd` | FLOAT64 | YES |
| `impressions` | INT64 | YES |
| `clicks` | INT64 | YES |
| `installs` | INT64 | YES |
| `rev_gross_d0_usd` | FLOAT64 | YES |
| `rev_gross_d7_usd` | FLOAT64 | YES |
| `rev_gross_d14_usd` | FLOAT64 | YES |
| `rev_gross_d30_usd` | FLOAT64 | YES |
| `rev_gross_d90_usd` | FLOAT64 | YES |
| `subscription_trial_start` | FLOAT64 | YES |
| `subscription_start_d0` | INT64 | YES |
| `subscription_start_d7` | INT64 | YES |
| `subscription_start_d14` | INT64 | YES |
| `cpi` | FLOAT64 | YES |
| `ctr` | FLOAT64 | YES |
| `cpc` | FLOAT64 | YES |
| `cpm` | FLOAT64 | YES |
| `roas_d0` | FLOAT64 | YES |
| `roas_d7` | FLOAT64 | YES |
| `roas_d14` | FLOAT64 | YES |
| `roas_d30` | FLOAT64 | YES |
| `roas_d90` | FLOAT64 | YES |

### DDL

```sql
CREATE TABLE `yellowhead-visionbi-rivery.yellowhead_prod.v_agent_globalcomix`
(
  client STRING,
  network STRING,
  date DATE,
  campaign_id STRING,
  campaign_name STRING,
  campaign_status STRING,
  adset_id STRING,
  adset_name STRING,
  breakdown_value STRING,
  breakdown_type STRING,
  os STRING,
  cost_usd FLOAT64,
  impressions INT64,
  clicks INT64,
  installs INT64,
  rev_gross_d0_usd FLOAT64,
  rev_gross_d7_usd FLOAT64,
  rev_gross_d14_usd FLOAT64,
  rev_gross_d30_usd FLOAT64,
  rev_gross_d90_usd FLOAT64,
  subscription_trial_start FLOAT64,
  subscription_start_d0 INT64,
  subscription_start_d7 INT64,
  subscription_start_d14 INT64,
  cpi FLOAT64,
  ctr FLOAT64,
  cpc FLOAT64,
  cpm FLOAT64,
  roas_d0 FLOAT64,
  roas_d7 FLOAT64,
  roas_d14 FLOAT64,
  roas_d30 FLOAT64,
  roas_d90 FLOAT64
);
```

### Normalization pattern — answers to the 7 questions

1. **Source tables it pulls from** — inspect the DDL above. Look for
   every `FROM \`yellowhead-visionbi-rivery.yellowhead_prod.…\`` and every `JOIN` /
   `UNION` line. List each `dwh_*` table referenced.
2. **Meta spend column** — `bq-security.ts` records that GlobalComix
   exposes `cost_usd` (Rivery standard). The underlying `dwh_fb2_globalcomix`
   spend column name appears in the Phase 4 / Meta mapping table above.
3. **Installs source** — does the DDL reference an AppsFlyer table?
   _DDL does not contain the token `appsflyer` — installs may be Meta-attributed only._
4. **JOIN vs UNION** — No `UNION ALL` detected. No `JOIN` detected. Confirm by reading the DDL block.
5. **ROAS computation** — no `roas` token in DDL — likely computed at read time by Lumen.
6. **breakdown_type filter** — DDL references `breakdown` — verify the filter.
7. **Currency conversion** — DDL mentions `currency` / `usd` — likely converts upstream.

### Contrast: `v_playw3_agent` DDL

This view is the cautionary tale: it lacks a `breakdown_type` filter,
which is why Lumen has to inject `dedupePredicate = "breakdown_type = 'No Breakdown'"`
at the query layer. The new `lumen_agent` ETL must apply that filter at
write time so the fact table is already deduplicated.

```sql
CREATE VIEW `yellowhead-visionbi-rivery.yellowhead_prod.v_playw3_agent`
AS WITH currency_exchange AS (
  SELECT
    eom_rate    AS rate_eur_to_usd,
    from_currency,
    DATE(date)  AS exchange_date
  FROM `yellowhead-visionbi-rivery.yellowhead_prod.pre_currency_exchange`
  WHERE to_currency = 'USD'
    AND from_currency = 'EUR'
  GROUP BY eom_rate, from_currency, exchange_date
),

-- ── Twitter/X ─────────────────────────────────────────────────────────────────
twitter AS (
  SELECT
    date,
    'Twitter'                               AS network,
    breakdown_type,
    breakdown_value,
    campaign_id,
    MAX(campaign_name)                      AS campaign_name,
    MAX(campaign_status)                    AS campaign_status,
    CASE WHEN MAX(campaign_name) LIKE '%BTB%'
         THEN MAX(campaign_name) END        AS btb_campaign_name,
    ad_group_id,
    MAX(ad_group_name)                      AS adset_name,
    MAX(adgroup_status)                     AS adset_status,
    ad_id,
    MAX(tweet_id)                           AS creative_id,
    MAX(full_text)                          AS creative_text,
    MAX(tweet_image_url)                    AS creative_image_url,
    MAX(card_name)                          AS creative_name,
    MAX(card_image_url)                     AS creative_thumbnail_url,
    SUM(CAST(cost_usd         AS FLOAT64))  AS spend_usd,
    CAST(NULL AS FLOAT64)                   AS spend_original_currency,
    CAST(NULL AS STRING)                    AS spend_currency,
    SUM(CAST(impressions      AS INT64))    AS impressions,
    SUM(CAST(clicks           AS INT64))    AS clicks,
    SUM(CAST(url_clicks       AS INT64))    AS url_clicks,
    SUM(CAST(purchases        AS INT64))    AS purchases,
    SUM(CAST(mobile_purchases AS INT64))    AS mobile_purchases,
    SUM(CAST(leads            AS INT64))    AS leads,
    CAST(NULL AS INT64)                     AS ftd_lifetime,
    CAST(NULL AS INT64)                     AS installs,
    SUM(CAST(leads            AS INT64))    AS btb_conversions,
    CAST(NULL AS INT64)                     AS retention_d3,
    CAST(NULL AS INT64)                     AS retention_d7,
    CAST(NULL AS FLOAT64)                   AS revenue_original_currency
  FROM `yellowhead-visionbi-rivery.yellowhead_prod.dwh_twitter_playw3`
  GROUP BY
    date, breakdown_type, breakdown_value,
    ad_group_id, campaign_id, ad_id
),

-- ── Facebook — No Breakdown (with creative join) ──────────────────────────────
facebook_no_breakdown AS (
  SELECT
    CAST(fb.date AS DATE)                   AS date,
    'Facebook'                              AS network,
    fb.breakdown_type,
    fb.breakdown_value,
    fb.campaign_id,
    MAX(fb.campagin_name)                   AS campaign_name,
    MAX(fb.campaign_status)                 AS campaign_status,
    CASE WHEN MAX(fb.campagin_name) LIKE '%BTB%'
         THEN MAX(fb.campagin_name) END     AS btb_campaign_name,
    fb.adset_id                             AS ad_group_id,
    MAX(fb.adset_name)                      AS adset_name,
    MAX(fb.adset_status)                    AS adset_status,
    fb.ad_id,
    MAX(fb.creative_id)                     AS creative_id,
    CAST(NULL AS STRING)                    AS creative_text,
    MAX(COALESCE(
        creative.max_thumbnail_url,
        creative.max_post_full_picture
    ))                                      AS creative_image_url,
    MAX(fb.ad_name)                         AS creative_name,
    MAX(COALESCE(
        creative.max_thumbnail_url,
        creative.max_post_full_picture
    ))                                      AS creative_thumbnail_url,
    SUM(fb.cost_usd)                        AS spend_usd,
    SUM(fb.cost_original_currency)          AS spend_original_currency,
    MAX(fb.currency)                        AS spend_currency,
    SUM(fb.impressions)                     AS impressions,
    SUM(fb.clicks)                          AS clicks,
    SUM(fb.clicks)                          AS url_clicks,
    CAST(NULL AS INT64)                     AS purchases,
    CAST(NULL AS INT64)                     AS mobile_purchases,
    SUM(fb.retention_d3)                    AS leads,
    SUM(fb.num_ftd_lifetime)                AS ftd_lifetime,
    SUM(fb.installs)                        AS installs,
    SUM(fb.conversion_1)                    AS btb_conversions,
    SUM(fb.retention_d3)                    AS retention_d3,
    SUM(fb.retention_d7)                    AS retention_d7,
    SUM(fb.rev_gross_lifetime_original_curr) AS revenue_original_currency
  FROM `yellowhead-visionbi-rivery.yellowhead_prod.dwh_fb2_playw3` fb
  LEFT JOIN (
    SELECT
      _creative_id,
      MAX(_thumbnail_url)     AS max_thumbnail_url,
      MAX(post_full_picture)  AS max_post_full_picture
    FROM `yellowhead-visionbi-rivery.yellowhead_prod.ods_fb2_creatives_playw3`
    GROUP BY _creative_id
  ) creative ON fb.creative_id = creative._creative_id
  WHERE fb.breakdown_type = 'No Breakdown'
  GROUP BY
    CAST(fb.date AS DATE), fb.breakdown_type, fb.breakdown_value,
    fb.adset_id, fb.campaign_id, fb.ad_id
),

-- ── Facebook — Country + Placement breakdowns ─────────────────────────────────
facebook_breakdowns AS (
  SELECT
    CAST(fb.date AS DATE)                   AS date,
    'Facebook'                              AS network,
    fb.breakdown_type,
    fb.breakdown_value,
    fb.campaign_id,
    MAX(fb.campagin_name)                   AS campaign_name,
    MAX(fb.campaign_status)                 AS campaign_status,
    CASE WHEN MAX(fb.campagin_name) LIKE '%BTB%'
         THEN MAX(fb.campagin_name) END     AS btb_campaign_name,
    fb.adset_id                             AS ad_group_id,
    MAX(fb.adset_name)                      AS adset_name,
    MAX(fb.adset_status)                    AS adset_status,
    fb.ad_id,
    MAX(fb.creative_id)                     AS creative_id,
    CAST(NULL AS STRING)                    AS creative_text,
    CAST(NULL AS STRING)                    AS creative_image_url,
    MAX(fb.ad_name)                         AS creative_name,
    CAST(NULL AS STRING)                    AS creative_thumbnail_url,
    SUM(fb.cost_usd)                        AS spend_usd,
    SUM(fb.cost_original_currency)          AS spend_original_currency,
    MAX(fb.currency)                        AS spend_currency,
    SUM(fb.impressions)                     AS impressions,
    SUM(fb.clicks)                          AS clicks,
    SUM(fb.clicks)                          AS url_clicks,
    CAST(NULL AS INT64)                     AS purchases,
    CAST(NULL AS INT64)                     AS mobile_purchases,
    SUM(fb.retention_d3)                    AS leads,
    SUM(fb.num_ftd_lifetime)                AS ftd_lifetime,
    SUM(fb.installs)                        AS installs,
    SUM(fb.conversion_1)                    AS btb_conversions,
    SUM(fb.retention_d3)                    AS retention_d3,
    SUM(fb.retention_d7)                    AS retention_d7,
    SUM(fb.rev_gross_lifetime_original_curr) AS revenue_original_currency
  FROM `yellowhead-visionbi-rivery.yellowhead_prod.dwh_fb2_playw3` fb
  WHERE fb.breakdown_type IN ('Country', 'Placement')
  GROUP BY
    CAST(fb.date AS DATE), fb.breakdown_type, fb.breakdown_value,
    fb.adset_id, fb.campaign_id, fb.ad_id
),

-- ── Union all three ───────────────────────────────────────────────────────────
combined AS (
  SELECT * FROM twitter
  UNION ALL
  SELECT * FROM facebook_no_breakdown
  UNION ALL
  SELECT * FROM facebook_breakdowns
)

-- ── Final SELECT — week fields computed here, no GROUP BY issue ───────────────
SELECT
  c.date,
  DATE_TRUNC(c.date, WEEK(SUNDAY))                  AS week_start,
  CONCAT(
    FORMAT_DATE('%b %e, %Y', DATE_TRUNC(c.date, WEEK(SUNDAY))),
    ' to ',
    FORMAT_DATE('%b %e, %Y', LAST_DAY(c.date, WEEK(SUNDAY)))
  )                                                 AS week_label,
  EXTRACT(WEEK FROM DATE_TRUNC(c.date, WEEK(SUNDAY))) AS week_number,
  c.network,
  c.breakdown_type,
  c.breakdown_value,
  c.campaign_id,
  c.campaign_name,
  c.campaign_status,
  c.btb_campaign_name,
  c.ad_group_id,
  c.adset_name,
  c.adset_status,
  c.ad_id,
  c.creative_id,
  c.creative_name,
  c.creative_text,
  c.creative_image_url,
  c.creative_thumbnail_url,
  c.spend_usd,
  c.spend_original_currency,
  c.spend_currency,
  c.impressions,
  c.clicks,
  c.url_clicks,
  SAFE_DIVIDE(c.clicks, c.impressions)              AS ctr,
  SAFE_DIVIDE(c.spend_usd, c.impressions) * 1000    AS cpm,
  c.purchases,
  c.mobile_purchases,
  c.leads,
  c.ftd_lifetime,
  c.installs,
  c.btb_conversions,
  c.retention_d3,
  c.retention_d7,
  SAFE_DIVIDE(c.spend_usd, c.installs)              AS cpi,
  SAFE_DIVIDE(c.spend_usd, c.ftd_lifetime)          AS cost_per_ftd,
  SAFE_DIVIDE(c.spend_usd, c.leads)                 AS cpl,
  c.revenue_original_currency,
  c.revenue_original_currency * fx.rate_eur_to_usd  AS revenue_usd,
  SAFE_DIVIDE(
    c.revenue_original_currency * fx.rate_eur_to_usd,
    c.spend_usd
  )                                                 AS roas,
  fx.rate_eur_to_usd

FROM combined c
LEFT JOIN currency_exchange fx
  ON c.date = fx.exchange_date;
```

---

## 6. ETL scripts needed

One BigQuery scheduled query per platform, each producing rows in the
shared `lumen_agent` shape. Keeping platforms separate (instead of one
mega-script) means a Meta column rename doesn't risk corrupting TikTok
data.

### Meta

- **Scheduled query name:** `lumen_etl_meta`
- **Source tables:** 259 `dwh_*` tables (one per client) — UNION ALL
- **Sample sources:** `dwh_fb2_100play`, `dwh_fb2_2k`, `dwh_fb2_302_slingo_arcade`, `dwh_fb2_88_fortune`, `dwh_fb2_Brix_Blast_Friends`, …
- **Columns to normalize:** see Phase 4 mapping above
- **Incremental window:** rolling 14 days (Meta backfills attribution up to 7d, plus 7d slack)
- **Estimated effort:** medium
- **Notes:** Apply `breakdown_type = 'No Breakdown'` if/where present. Fall back to `cost_usd` if `spend_usd` is absent.

### AppsFlyer

- **Scheduled query name:** `lumen_etl_appsflyer`
- **Source tables:** 6 `dwh_*` tables (one per client) — UNION ALL
- **Sample sources:** `dwh_appsflyer_appreel`, `dwh_appsflyer_baby_tv`, `dwh_appsflyer_block_puzzle`, `dwh_appsflyer_columns_gett`, `dwh_appsflyer_coreloop`, …
- **Columns to normalize:** see Phase 4 mapping above
- **Incremental window:** rolling 14 days (install attribution window)
- **Estimated effort:** medium
- **Notes:** JOIN back to Meta on `(date, campaign_id)` to fill installs/revenue on rows already produced by the Meta ETL.

### TikTok

- **Scheduled query name:** `lumen_etl_tiktok`
- **Source tables:** 67 `dwh_*` tables (one per client) — UNION ALL
- **Sample sources:** `dwh_tiktok_2k`, `dwh_tiktok_88_fortune`, `dwh_tiktok_a1`, `dwh_tiktok_adgroup`, `dwh_tiktok_age_winner_winner`, …
- **Columns to normalize:** see Phase 4 mapping above
- **Incremental window:** rolling 14 days
- **Estimated effort:** medium
- **Notes:** Handle both `dwh_tiktok_*` and `dwh_tik_tok_*` naming via UNION of two regex-matched table groups.

### Google Ads

- **Scheduled query name:** `lumen_etl_google_ads`
- **Source tables:** 165 `dwh_*` tables (one per client) — UNION ALL
- **Sample sources:** `dwh_google_aaptiv`, `dwh_google_adventure_tales`, `dwh_google_adwords`, `dwh_google_adwords_Lumi`, `dwh_google_adwords_Lumi_analytics`, …
- **Columns to normalize:** see Phase 4 mapping above
- **Incremental window:** rolling 14 days
- **Estimated effort:** medium
- **Notes:** `adwords` vs `google` token divergence — sample names in Phase 3.

---

## 7. Load strategy

Use BigQuery `MERGE` keyed on `(date, client, network, campaign_id, adset_id)`.
This is idempotent (re-running for the same window doesn't duplicate)
and lets each platform ETL touch only its own rows.

```sql
MERGE `yellowhead-visionbi-rivery.yellowhead_prod.lumen_agent` T
USING (
  SELECT … FROM <staging>          -- one platform, normalized to lumen_agent shape
  WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY)
) S
ON  T.date = S.date
AND T.client = S.client
AND T.network = S.network
AND COALESCE(T.campaign_id, '') = COALESCE(S.campaign_id, '')
AND COALESCE(T.adset_id, '')    = COALESCE(S.adset_id, '')
WHEN MATCHED THEN UPDATE SET
  spend_usd = S.spend_usd, impressions = S.impressions, clicks = S.clicks,
  installs  = S.installs,  revenue_usd = S.revenue_usd,
  roas = S.roas, cpi = S.cpi, ctr = S.ctr,
  campaign_name = S.campaign_name, adset_name = S.adset_name
WHEN NOT MATCHED THEN INSERT ROW;
```

**Partition pruning** — the MERGE `USING` block filters on `date`,
and the table is `PARTITION BY date`, so the source side scans only
the rolling window. The target side scans all partitions touched by
the source — fine, because they overlap by design.

---

## 8. Refresh schedule

Rivery's sync cadence is the upstream rate-limit. There is a view
called `v_rivery_activity_check` already in this dataset (the prompt
flagged it) — we read its watermark and only kick the ETL when the
latest Rivery run is newer than our last run.

Suggested cadence: two scheduled queries per platform per day, at
06:00 and 14:00 Israel time, gated by a "skip if Rivery hasn't moved"
check. This matches Looker Studio's perceived freshness today.

---

## 9. Client onboarding checklist

Once `lumen_agent` exists, adding a client is:

1. **Add UNION block per platform.** For each `dwh_*` table the new
   client has, append a UNION ALL branch to that platform's ETL.
2. **Backfill once.** Run that platform's scheduled query with
   `date >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY)` on a one-shot.
3. **Insert one row into `lumen_clients`** with slug, name, vertical,
   networks.
4. **Add slug to `ALLOWED_CLIENTS` env var** in Vercel (preview + prod).
5. **Smoke test** — open `/dashboard?client=<slug>` and confirm KPIs
   match Looker Studio for the past 7 days.

No schema change. No new table. No new code path in Lumen.

---

## 10. Migration path for GlobalComix and Playw3

These two clients use the legacy `v_agent_globalcomix` and
`v_playw3_agent` paths today (see `src/lib/bq-security.ts`).

1. **Populate `lumen_agent`** with both clients (backfill 365 days).
2. **Cross-check numbers** — spend, installs, revenue per day per
   network — for 2 weeks. Acceptable drift: <0.5%. Anything larger is
   a bug to resolve before cutover.
3. **Cut over `bq-security.ts`** to route both clients through the new
   shared path (`strategy: "lumen-agent"` or equivalent).
4. **Retire** the per-client `spendCol` / `revenueCol` /
   `dedupePredicate` config — the new fact table is already
   normalized.
5. **Drop** `bq-queries-100play.ts` after 100play follows the same path.

---

## 11. Open questions

1. Meta spend column is consistently `cost_usd` across sampled tables. Confirm this holds across all 259 clients before we hard-code it in the ETL.
2. Some Meta tables expose an `installs` column directly (`installs`). Decide: prefer Meta-attributed installs or AppsFlyer-attributed installs when both exist? They will disagree.
3. **251 clients have Meta spend but no AppsFlyer/Adjust/Kochava table.** Are they all active clients, or are some stale and safe to exclude from `lumen_clients`?
4. **927 `dwh_*` tables did not match any platform token** and were dropped from the inventory. First 10: `dwh_1to1`, `dwh_1to1_bing`, `dwh_1to1_fb_web`, `dwh_1to1_fb_web_sku`, `dwh_1to1_gg_web_new`, `dwh_1to1_networks`, `dwh_action_item_tracker`, `dwh_alerts_fb_gurushots`, `dwh_all_heads_up`, `dwh_analytics4_pampers_all`. Confirm none of these contain client data we'd miss.
5. What is the actual Rivery sync cadence per platform? Section 8 assumes 2x/day — verify against `v_rivery_activity_check`.
6. Is there a test/anonymized BQ environment we should target for the ETL dry-runs, or do we develop the scheduled queries directly against `yellowhead_prod`?

---

## Appendix A — Spot data check

Non-agent client picked: `appreel`

Primary table: `dwh_fb2_appreel`

| metric | value |
|---|---|
| rows | 16,163 |
| earliest date | 2026-02-24 |
| latest date | 2026-05-11 |
| distinct campaigns | 7 |
| spend (col=`cost_usd`) | 44,650.23 |
| installs (col=`installs`) | — |

Confirms: live, queryable, recent data.
