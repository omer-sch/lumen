# 100play — Schema Inspection (Phase 1)
Generated: 2026-05-11T10:46:50.433Z
Project: yellowhead-visionbi-rivery
Dataset: yellowhead_prod

## 1a. Schema — `dwh_fb2_ios14_appsflyer_100play`

Total columns: 22

| column_name | data_type | is_nullable |
| --- | --- | --- |
| master_account_id | INT64 | YES |
| master_account | STRING | YES |
| os | STRING | YES |
| account_id | STRING | YES |
| cost_usd | FLOAT64 | YES |
| cost_plus_fee | FLOAT64 | YES |
| cost_by_account | FLOAT64 | YES |
| clicks | INT64 | YES |
| reach | INT64 | YES |
| impressions | INT64 | YES |
| rev_lifetime_usd | FLOAT64 | YES |
| num_ftd_lifetime | INT64 | YES |
| retention_d0 | INT64 | YES |
| retention_d1 | INT64 | YES |
| retention_d3 | INT64 | YES |
| retention_d7 | INT64 | YES |
| retention_d14 | INT64 | YES |
| retention_d30 | FLOAT64 | YES |
| organic_revenue | FLOAT64 | YES |
| total_revenue | FLOAT64 | YES |
| date | STRING | YES |
| account_name | STRING | YES |

## 1b. Schema — `dwh_fb2_100play`

Total columns: 251

| column_name | data_type | is_nullable |
| --- | --- | --- |
| master_account_id | INT64 | YES |
| master_account | STRING | YES |
| os | STRING | YES |
| customer_id | INT64 | YES |
| customer | STRING | YES |
| title_id | INT64 | YES |
| title | STRING | YES |
| network_ID | INT64 | YES |
| Network | STRING | YES |
| Tracker_ID | INT64 | YES |
| Tracker | STRING | YES |
| date_from | TIMESTAMP | YES |
| date_to | TIMESTAMP | YES |
| store_fee | FLOAT64 | YES |
| store_fee_from_date | TIMESTAMP | YES |
| Store_fee_to_date | TIMESTAMP | YES |
| is_store_fee_in_net | STRING | YES |
| date | STRING | YES |
| account_id | STRING | YES |
| account_name | STRING | YES |
| campaign_id | STRING | YES |
| campagin_name | STRING | YES |
| adset_id | STRING | YES |
| adset_name | STRING | YES |
| ad_id | STRING | YES |
| ad_name | STRING | YES |
| ad_status | STRING | YES |
| adset_status | STRING | YES |
| campaign_status | STRING | YES |
| campaign_stop_time | STRING | YES |
| ad_created_time | STRING | YES |
| creative_id | STRING | YES |
| creative_name | STRING | YES |
| creative_type | STRING | YES |
| body | STRING | YES |
| creative_title | STRING | YES |
| video_id | STRING | YES |
| thumbnail_url | STRING | YES |
| image_url | STRING | YES |
| page_post_url | STRING | YES |
| instagram_permalink_url | STRING | YES |
| effective_object_story_id | STRING | YES |
| call_to_action_type | STRING | YES |
| video_url | STRING | YES |
| image_hash | STRING | YES |
| url_by_ad_type | STRING | YES |
| is_instagram_url | INT64 | YES |
| billing_event | STRING | YES |
| bid_amount | INT64 | YES |
| optimization_goal | STRING | YES |
| daily_budget | INT64 | YES |
| adset_start_time | STRING | YES |
| campaign_start_time | STRING | YES |
| breakdown_type | STRING | YES |
| breakdown_value | STRING | YES |
| frequency | FLOAT64 | YES |
| date_stop | STRING | YES |
| cost_original_currency | FLOAT64 | YES |
| cost_usd | FLOAT64 | YES |
| cost_plus_fee | FLOAT64 | YES |
| cost_by_account | FLOAT64 | YES |
| agency_fee | FLOAT64 | YES |
| clicks | INT64 | YES |
| reach | INT64 | YES |
| currency | STRING | YES |
| impressions | INT64 | YES |
| account_currency | STRING | YES |
| ad_id_fact | STRING | YES |
| account_id_fact | STRING | YES |
| exchange_rate_to_us | FLOAT64 | YES |
| currency_convert | STRING | YES |
| installs | INT64 | YES |
| monthly_active_users | INT64 | YES |
| place_holder1 | STRING | YES |
| place_holder2 | STRING | YES |
| place_holder3 | BOOL | YES |
| place_holder4 | BOOL | YES |
| place_holder5 | BOOL | YES |
| place_holder6 | BOOL | YES |
| place_holder7 | BOOL | YES |
| place_holder8 | BOOL | YES |
| place_holder9 | INT64 | YES |
| place_holder10 | INT64 | YES |
| num_ftd0 | INT64 | YES |
| num_ftd1 | INT64 | YES |
| num_ftd3 | INT64 | YES |
| num_ftd4 | INT64 | YES |
| num_ftd7 | INT64 | YES |
| num_ftd8 | INT64 | YES |
| num_ftd14 | INT64 | YES |
| num_ftd15 | INT64 | YES |
| num_ftd30 | INT64 | YES |
| num_ftd60 | INT64 | YES |
| num_ftd90 | INT64 | YES |
| num_ftd_mtd | INT64 | YES |
| num_ftd_all | INT64 | YES |
| num_ftd_lifetime | INT64 | YES |
| retention_d0 | INT64 | YES |
| retention_d1 | INT64 | YES |
| retention_d3 | INT64 | YES |
| retention_d7 | INT64 | YES |
| retention_d0_true | INT64 | YES |
| retention_d14 | INT64 | YES |
| retention_d30 | FLOAT64 | YES |
| custom_event_int1 | INT64 | YES |
| custom_event_int2 | INT64 | YES |
| custom_event_float1 | FLOAT64 | YES |
| custom_event_float2 | FLOAT64 | YES |
| ev_12m_net_midpoint | FLOAT64 | YES |
| data_source | STRING | YES |
| attribution_source | STRING | YES |
| rev_gross_d0_original_curr | FLOAT64 | YES |
| rev_gross_d1_original_curr | FLOAT64 | YES |
| rev_gross_d3_original_curr | FLOAT64 | YES |
| rev_gross_d4_original_curr | FLOAT64 | YES |
| rev_gross_d7_original_curr | FLOAT64 | YES |
| rev_gross_d8_original_curr | FLOAT64 | YES |
| rev_gross_d14_original_curr | FLOAT64 | YES |
| rev_gross_d15_original_curr | FLOAT64 | YES |
| rev_gross_d30_original_curr | FLOAT64 | YES |
| rev_gross_d60_original_curr | FLOAT64 | YES |
| rev_gross_d90_original_curr | FLOAT64 | YES |
| rev_gross_mtd_original_curr | FLOAT64 | YES |
| rev_gross_total_original_curr | FLOAT64 | YES |
| rev_gross_lifetime_original_curr | FLOAT64 | YES |
| rev_net_d0_original_curr | FLOAT64 | YES |
| rev_net_d1_original_curr | FLOAT64 | YES |
| rev_net_d3_original_curr | FLOAT64 | YES |
| rev_net_d4_original_curr | FLOAT64 | YES |
| rev_net_d7_original_curr | FLOAT64 | YES |
| rev_net_d8_original_curr | FLOAT64 | YES |
| rev_net_d14_original_curr | FLOAT64 | YES |
| rev_net_d15_original_curr | FLOAT64 | YES |
| rev_net_d30_original_curr | FLOAT64 | YES |
| rev_net_d60_original_curr | FLOAT64 | YES |
| rev_net_d90_original_curr | FLOAT64 | YES |
| rev_net_mtd_original_curr | FLOAT64 | YES |
| rev_net_total_original_curr | FLOAT64 | YES |
| rev_net_lifetime_original_curr | FLOAT64 | YES |
| rev_by_acc_d0_original_curr | FLOAT64 | YES |
| rev_by_acc_d1_original_curr | FLOAT64 | YES |
| rev_by_acc_d2_original_curr | FLOAT64 | YES |
| rev_by_acc_d3_original_curr | FLOAT64 | YES |
| rev_by_acc_d6_original_curr | FLOAT64 | YES |
| rev_by_acc_d7_original_curr | FLOAT64 | YES |
| rev_by_acc_d13_original_curr | FLOAT64 | YES |
| rev_by_acc_d14_original_curr | FLOAT64 | YES |
| rev_by_acc_d30_original_curr | FLOAT64 | YES |
| rev_by_acc_d60_original_curr | FLOAT64 | YES |
| rev_by_acc_d90_original_curr | FLOAT64 | YES |
| rev_by_acc_mtd_original_curr | FLOAT64 | YES |
| rev_by_acc_total_original_curr | FLOAT64 | YES |
| rev_by_acc_lieftime_original_curr | FLOAT64 | YES |
| rev_gross_d0_usd | FLOAT64 | YES |
| rev_gross_d1_usd | FLOAT64 | YES |
| rev_gross_d3_usd | FLOAT64 | YES |
| rev_gross_d4_usd | FLOAT64 | YES |
| rev_gross_d7_usd | FLOAT64 | YES |
| rev_gross_d8_usd | FLOAT64 | YES |
| rev_gross_d14_usd | FLOAT64 | YES |
| rev_gross_d15_usd | FLOAT64 | YES |
| rev_gross_d30_usd | FLOAT64 | YES |
| rev_gross_d60_usd | FLOAT64 | YES |
| rev_gross_d90_usd | FLOAT64 | YES |
| rev_gross_mtd_usd | FLOAT64 | YES |
| rev_gross_total_usd | FLOAT64 | YES |
| rev_gross_lifetime_usd | FLOAT64 | YES |
| rev_net_d0_usd | FLOAT64 | YES |
| rev_net_d1_usd | FLOAT64 | YES |
| rev_net_d3_usd | FLOAT64 | YES |
| rev_net_d4_usd | FLOAT64 | YES |
| rev_net_d7_usd | FLOAT64 | YES |
| rev_net_d8_usd | FLOAT64 | YES |
| rev_net_d14_usd | FLOAT64 | YES |
| rev_net_d15_usd | FLOAT64 | YES |
| rev_net_d30_usd | FLOAT64 | YES |
| rev_net_d60_usd | FLOAT64 | YES |
| rev_net_d90_usd | FLOAT64 | YES |
| rev_net_mtd_usd | FLOAT64 | YES |
| rev_net_total_usd | FLOAT64 | YES |
| rev_net_lifetime_usd | FLOAT64 | YES |
| rev_by_acc_d0_usd | FLOAT64 | YES |
| rev_by_acc_d1_usd | FLOAT64 | YES |
| rev_by_acc_d3_usd | FLOAT64 | YES |
| rev_by_acc_d4_usd | FLOAT64 | YES |
| rev_by_acc_d7_usd | FLOAT64 | YES |
| rev_by_acc_d8_usd | FLOAT64 | YES |
| rev_by_acc_d14_usd | FLOAT64 | YES |
| rev_by_acc_d15_usd | FLOAT64 | YES |
| rev_by_acc_d30_usd | FLOAT64 | YES |
| rev_by_acc_d60_usd | FLOAT64 | YES |
| rev_by_acc_d90_usd | FLOAT64 | YES |
| rev_by_acc_mtd_usd | FLOAT64 | YES |
| rev_by_acc_total_usd | FLOAT64 | YES |
| rev_by_acc_lifetime_usd | FLOAT64 | YES |
| ad_rev_d0_original_curr | FLOAT64 | YES |
| ad_rev_d3_original_curr | FLOAT64 | YES |
| ad_rev_d7_original_curr | FLOAT64 | YES |
| ad_rev_d30_original_curr | FLOAT64 | YES |
| ad_rev_d0_usd | FLOAT64 | YES |
| ad_rev_d3_usd | FLOAT64 | YES |
| ad_rev_d7_usd | FLOAT64 | YES |
| ad_rev_d30_usd | FLOAT64 | YES |
| cr_view_1d | INT64 | YES |
| cr_click_1d | INT64 | YES |
| cr_click_7d | INT64 | YES |
| cr_click_28d | INT64 | YES |
| p_view_1d | INT64 | YES |
| p_click_1d | INT64 | YES |
| p_click_7d | INT64 | YES |
| p_click_28d | INT64 | YES |
| custom_event1_value | INT64 | YES |
| custom_event2_value | INT64 | YES |
| custom_event3_value | INT64 | YES |
| custom_event4_value | INT64 | YES |
| creative_image_url | STRING | YES |
| creative_post_url | STRING | YES |
| creative_video_url | STRING | YES |
| creative_thumbnail_url | STRING | YES |
| creative_full_picture | STRING | YES |
| image_hash_filename | STRING | YES |
| ad_image_url | STRING | YES |
| ad_post_url | STRING | YES |
| ad_video_url | STRING | YES |
| ad_thumbnail_url | STRING | YES |
| ad_full_picture | STRING | YES |
| ret_d0 | INT64 | YES |
| ret_d1 | INT64 | YES |
| ret_d3 | INT64 | YES |
| ret_d7 | INT64 | YES |
| ret_d30 | INT64 | YES |
| bid_strategy | STRING | YES |
| minimum_roas_control | INT64 | YES |
| custom_event_type | STRING | YES |
| preview_shareable_link | STRING | YES |
| image_hash_original_height | INT64 | YES |
| image_hash_original_width | INT64 | YES |
| video_thruplay_watched_actions_28d_click | INT64 | YES |
| video_thruplay_watched_actions_1d_view | INT64 | YES |
| video_p100_watched_actions_28d_click | INT64 | YES |
| video_p100_watched_actions_1d_view | INT64 | YES |
| smart_promotion_type | STRING | YES |
| video_p100_value | INT64 | YES |
| video_p95_value | INT64 | YES |
| video_p75_value | INT64 | YES |
| video_p50_value | INT64 | YES |
| video_p25_value | INT64 | YES |
| retained_users | INT64 | YES |
| installs_adjust | INT64 | YES |
| u_purchase | INT64 | YES |
| unique_purchase | INT64 | YES |

## 1c. Schema — `ods_appsflyer_patners_by_date_report_100play`

Total columns: 60

| column_name | data_type | is_nullable |
| --- | --- | --- |
| Date | STRING | YES |
| Agency_PMD_af_prt | STRING | YES |
| Media_Source_pid | STRING | YES |
| Campaign_c | STRING | YES |
| Impressions | STRING | YES |
| Clicks | STRING | YES |
| CTR | STRING | YES |
| Installs | STRING | YES |
| Conversion_Rate | STRING | YES |
| Sessions | STRING | YES |
| Loyal_Users | STRING | YES |
| Loyal_Users_Installs | STRING | YES |
| Total_Revenue | STRING | YES |
| Total_Cost | STRING | YES |
| ROI | STRING | YES |
| ARPU | STRING | YES |
| Average_eCPI | STRING | YES |
| account_created_Unique_users | STRING | YES |
| account_created_Event_counter | STRING | YES |
| account_created_Sales_in_USD | STRING | YES |
| af_ad_view_Unique_users | STRING | YES |
| af_ad_view_Event_counter | STRING | YES |
| af_ad_view_Sales_in_USD | STRING | YES |
| af_complete_registration_Unique_users | STRING | YES |
| af_complete_registration_Event_counter | STRING | YES |
| af_complete_registration_Sales_in_USD | STRING | YES |
| af_digital_game_Unique_users | STRING | YES |
| af_digital_game_Event_counter | STRING | YES |
| af_digital_game_Sales_in_USD | STRING | YES |
| af_invite_Unique_users | STRING | YES |
| af_invite_Event_counter | STRING | YES |
| af_invite_Sales_in_USD | STRING | YES |
| af_login_Unique_users | STRING | YES |
| af_login_Event_counter | STRING | YES |
| af_login_Sales_in_USD | STRING | YES |
| af_purchase_Unique_users | STRING | YES |
| af_purchase_Event_counter | STRING | YES |
| af_purchase_Sales_in_USD | STRING | YES |
| af_share_Unique_users | STRING | YES |
| af_share_Event_counter | STRING | YES |
| af_share_Sales_in_USD | STRING | YES |
| game_played_Unique_users | STRING | YES |
| game_played_Event_counter | STRING | YES |
| game_played_Sales_in_USD | STRING | YES |
| game_won_Unique_users | STRING | YES |
| game_won_Event_counter | STRING | YES |
| game_won_Sales_in_USD | STRING | YES |
| post_win_swap_Unique_users | STRING | YES |
| post_win_swap_Event_counter | STRING | YES |
| post_win_swap_Sales_in_USD | STRING | YES |
| prize_vault_swap_Unique_users | STRING | YES |
| prize_vault_swap_Event_counter | STRING | YES |
| prize_vault_swap_Sales_in_USD | STRING | YES |
| purchase_token_Unique_users | STRING | YES |
| purchase_token_Event_counter | STRING | YES |
| purchase_token_Sales_in_USD | STRING | YES |
| shipping_request_Unique_users | STRING | YES |
| shipping_request_Event_counter | STRING | YES |
| shipping_request_Sales_in_USD | STRING | YES |
| app_id | STRING | YES |

## Column discovery on primary table

| role | detected column |
|---|---|
| date          | date |
| spend         | cost_usd |
| installs      | _(not found)_ |
| revenue       | rev_lifetime_usd |
| network       | _(not found)_ |
| campaign_id   | _(not found)_ |
| campaign_name | _(not found)_ |

## Column discovery on secondary table (`dwh_fb2_100play`)

| role | detected column |
|---|---|
| date     | date |
| spend    | cost_usd |
| installs | installs |

## 1d. Row count, date range, totals — `dwh_fb2_ios14_appsflyer_100play`

| total_rows | earliest_date | latest_date | total_spend | total_installs | total_revenue |
| --- | --- | --- | --- | --- | --- |
| 944 | 2023-09-27 | 2026-05-10 | 2286.8099999999995 |  | 0 |

## 1e. Overlap check between the two dwh tables

| source | earliest | latest | row_count |
| --- | --- | --- | --- |
| dwh_fb2_ios14_appsflyer_100play | 2023-09-27 | 2026-05-10 | 944 |
| dwh_fb2_100play | 2023-10-15 | 2023-12-12 | 2323 |

### Days that appear in BOTH tables (with summed spend on those days)

| overlapping_days | sum_spend_primary_overlap | sum_spend_secondary_overlap |
| --- | --- | --- |
| 38 | 2138.5599999999995 | 19421.490002 |

## 1f. Null / zero checks on primary table

| installs_null | installs_zero | spend_null | spend_zero | revenue_null | revenue_zero | total_rows |
| --- | --- | --- | --- | --- | --- | --- |
|  |  | 913 | 0 | 881 | 63 | 944 |

## Distinct networks on primary table

No network/channel column detected — channel mix will need a synthesized constant (e.g. "Meta").

---

## Phase 2 inputs (to be referenced by bq-queries-100play.ts)

```json
{
  "primaryTable": "dwh_fb2_ios14_appsflyer_100play",
  "secondaryTable": "dwh_fb2_100play",
  "appsflyerOdsTable": "ods_appsflyer_patners_by_date_report_100play",
  "primary": {
    "dateCol": "date",
    "spendCol": "cost_usd",
    "installsCol": null,
    "revenueCol": "rev_lifetime_usd",
    "networkCol": null,
    "campaignIdCol": null,
    "campaignNameCol": null
  },
  "secondary": {
    "dateCol": "date",
    "spendCol": "cost_usd",
    "installsCol": "installs"
  }
}
```