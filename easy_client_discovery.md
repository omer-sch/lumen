# Lumen — Easy Client Discovery (v2)
Generated: 2026-05-11T10:41:08.621Z

## Step 1 — Load all table names from yellowhead_prod

Total tables/views: 7583

## Step 2 — GlobalComix reference tables (our gold standard)

Found 67 GlobalComix tables:

| table_name |
|---|
| dwh_apple_globalcomix |
| dwh_apple_globalcomix2 |
| dwh_apple_globalcomix_adjust |
| dwh_apple_globalcomix_adjust2 |
| dwh_fb2_globalcomix |
| dwh_fb2_globalcomix_adjust |
| dwh_google_ads_final_globalcomix |
| dwh_google_ads_globalcomix |
| dwh_google_ads_globalcomix_adjust |
| dwh_mntn_globalcomix |
| dwh_tik_tok_globalcomix |
| dwh_tik_tok_globalcomix_adjust |
| dwh_total_subs_globalcomix |
| fct_performance_globalcomix |
| ods_adjust_14d_cohorts_report_globalcomix |
| ods_adjust_30d_cohorts_report_globalcomix |
| ods_adjust_7d_cohorts_report_globalcomix |
| ods_adjust_90d_cohorts_report_globalcomix |
| ods_adjust_cohorts_report_globalcomix |
| ods_adjust_events_globalcomix |
| ods_adjust_overview_report_globalcomix |
| ods_adjust_skad_report_globalcomix |
| ods_api_mntn_campaign_globalcomix |
| ods_apple_campaign_globalcomix |
| ods_apple_metrics_adgroup_globalcomix |
| ods_apple_searchterms_globalcomix |
| ods_fb2_ads_globalcomix |
| ods_fb2_creatives_globalcomix |
| ods_fb2_insight_campaign_globalcomix |
| ods_fb2_insight_general_web_globalcomix |
| ods_fb2_insight_geo_web_globalcomix |
| ods_fb2_insight_placement_web_globalcomix |
| ods_google_ads_ad_globalcomix_no_keywords |
| ods_google_ads_adgroup_globalcomix |
| ods_google_ads_age_globalcomix |
| ods_google_ads_campaign_globalcomix |
| ods_google_ads_conversions_globalcomix_no_keywords |
| ods_google_ads_country_globalcomix |
| ods_google_ads_geo_conversions_globalcomix |
| ods_google_ads_keyword_globalcomix |
| ods_google_ads_kw_ad_globalcomix |
| ods_google_ads_kw_conversions_globalcomix |
| ods_google_ads_performance_ad_globalcomix |
| ods_google_ads_performance_conversions_globalcomix |
| ods_google_ads_performance_country_globalcomix |
| ods_google_ads_performance_geo_conversions_globalcomix |
| ods_mail_adjust_globalcomix |
| ods_pre_subs_globalcomix |
| ods_tik_tok_ad_insight_country_globalcomix |
| ods_tik_tok_ad_insight_general_globalcomix |
| ods_tik_tok_ad_insight_placement_globalcomix |
| ods_tik_tok_adgroup_insight_country_globalcomix |
| ods_tik_tok_adgroup_insight_general_globalcomix |
| ods_tik_tok_adgroup_insight_placement_globalcomix |
| ods_tik_tok_adgroups_globalcomix |
| ods_tik_tok_ads_globalcomix |
| ods_tik_tok_campaign_globalcomix |
| ods_tiktok_auction_adgroup_stats_globalcomix |
| ods_tiktok_auction_ads_stats_globalcomix |
| ods_url_subs_globalcomix |
| pre_apple_network_globalcomix |
| stg_apple_globalcomix |
| stg_facebook_globalcomix |
| stg_google_globalcomix |
| stg_tiktok_globalcomix |
| uni_adjust_cohort_report_globalcomix |
| v_agent_globalcomix |

GlobalComix platform tokens found: apple, adjust, fb2, google, tiktok, facebook

## Step 3 — Extract all client slugs from table name suffixes

## Step 4 — Candidates: have Meta (fb2) AND AppsFlyer

| client_slug | platform_count | platforms | sample_tables |
|---|---|---|---|
| 100play | 2 | fb2, appsflyer | dwh_fb2_100play, dwh_fb2_ios14_appsflyer_100play, ods_appsflyer_patners_by_date_report_100play |
| abradoodle | 2 | fb2, appsflyer | dwh_fb2_abradoodle, ods_appsflyer_snapchat_in_app_abradoodle, ods_appsflyer_snapchat_installs_abradoodle |
| life | 2 | fb2, appsflyer | dwh_fb2_dice_life, dwh_fb2_power_life, ods_fb2_ads_dice_life |
| keno | 2 | fb2, appsflyer | dwh_fb2_ios14_appsflyer_keno, dwh_fb2_ios14_keno, dwh_fb2_keno |
| star | 2 | fb2, appsflyer | dwh_fb2_ios14_appsflyer_keno_star, dwh_fb2_keno_star, ods_appsflyer_patners_by_date_report_keno_star |
| stories | 2 | fb2, appsflyer | dwh_fb2_merge_stories, ods_appsflyer_in_app_events_report_merge_stories, ods_appsflyer_installs_report_merge_stories |
| heritage | 2 | fb2, appsflyer | dwh_fb2_my_heritage, ods_fb2_ads_my_heritage, ods_fb2_creatives_my_heritage |
| tango | 2 | appsflyer, fb2 | ods_appsflyer_geo_by_date_report_tango, ods_appsflyer_in_app_events_report_tango, ods_appsflyer_installs_report_tango |
| ezsave | 2 | appsflyer, fb2 | ods_appsflyer_in_app_events_report_ezsave, ods_appsflyer_installs_report_ezsave, ods_fb2_ads_ezsave |
| tango2021 | 2 | fb2, appsflyer | ods_fb2_ads_tango2021, ods_fb2_insight_general_web_dco_tango2021, ods_fb2_insight_geo_web_dco_tango2021 |
| rock_android | 2 | appsflyer, fb2 | ods_mail_appsflyer_ftd_hard_rock_android, ods_mail_appsflyer_purchase_hard_rock_android, ods_mail_appsflyer_retention_hard_rock_android |
| rock_ios | 2 | appsflyer, fb2 | ods_mail_appsflyer_ftd_hard_rock_ios, ods_mail_appsflyer_purchase_hard_rock_ios, ods_mail_appsflyer_retention_hard_rock_ios |
| purchase | 2 | appsflyer, fb2 | ods_mail_appsflyer_gurushots_asa_count_purchase, ods_mail_appsflyer_gurushots_asa_purchase, ods_mail_appsflyer_gurushots_purchase |
| osu | 3 | apple, fb2, appsflyer | dwh_apple_osu, dwh_fb2_osu, ods_apple_adgroup_osu |
| tales | 3 | fb2, google, appsflyer | dwh_fb2_adventure_tales, dwh_fb2_age_gender_adventure_tales, dwh_google_ads_adventure_tales |
| roller | 3 | fb2, google, appsflyer | dwh_fb2_age_gender_high_roller, dwh_fb2_dl_high_roller, dwh_fb2_high_roller |
| appreel | 3 | fb2, appsflyer, tiktok | dwh_fb2_appreel, dwh_fb2_dl_appreel, dwh_uni_appsflyer_appreel |
| stardust | 3 | fb2, apple, appsflyer | dwh_fb2_appsflyer_stardust, dwh_fb2_ios14_appsflyer_stardust, dwh_fb2_ios14_stardust |
| rock | 3 | fb2, google, appsflyer | dwh_fb2_hard_rock, dwh_google_adwords_hard_rock, ods_appsflyer_snapchat_in_app_hard_rock |
| conversions | 3 | fb2, google, appsflyer | dwh_fb2_ios14_shifted_conversions, ods_google_ads_ios14_campaign_conversions, ods_map_google_ads_custom_conversions |
| placement | 3 | fb2, adwords, appsflyer | dwh_fb2_old_spice_placement, dwh_fb2_pampers_lumi_placement, dwh_fb2_whalo_dl_placement |
| spiral | 3 | apple, fb2, appsflyer | ods_apple_campaign_spiral, ods_apple_metrics_adgroup_spiral, ods_apple_searchterms_spiral |
| mapping | 3 | appsflyer, fb2, google | ods_appsflyer_dl_mapping, ods_fb2_gaming_kpi_mapping, ods_google_search_console_geo_mapping |
| huuuge | 3 | fb2, appsflyer, tiktok | ods_fb2_ads_huuuge, ods_fb2_creatives_huuuge, ods_fb2_insight_general_huuuge |
| tv | 4 | apple, appsflyer, fb2, google | dwh_apple_baby_tv, dwh_appsflyer_patners_by_date_baby_tv, dwh_fb2_baby_tv |
| bookful | 4 | apple, fb2, appsflyer, google | dwh_apple_bookful, dwh_fb2_bookful, ods_apple_adgroup_bookful |
| curve | 4 | apptweak, fb2, google, appsflyer | dwh_apptweak_android_curve_curve, dwh_apptweak_category_rankings_curve_curve, dwh_apptweak_featured_content_curve_curve |
| puzzle | 4 | fb2, google, appsflyer, tiktok | dwh_fb2_block_puzzle, dwh_fb2_dl_block_puzzle, dwh_google_ads_block_puzzle |
| winner | 4 | fb2, google, appsflyer, tiktok | dwh_fb2_ios14_winner_winner, dwh_fb2_winner_winner, dwh_google_ads_winner_winner |
| coreloop | 5 | apple, fb2, google, appsflyer, tiktok | dwh_apple_coreloop, dwh_apple_dl_coreloop, dwh_fb2_coreloop |
| dreams | 5 | apple, fb2, google, appsflyer, tiktok | dwh_apple_dice_dreams, dwh_fb2_golf_dreams, dwh_fb2_tenjin_golf_dreams |
| poker | 6 | apple, apptweak, fb2, google, appsflyer, kochava | dwh_apple_governor_of_poker, dwh_apple_hd_poker, dwh_apple_video_poker |
| slots | 7 | apple, fb2, google, appsflyer, adjust, kochava, tiktok | dwh_apple_dl_mundo_slots, dwh_apple_mundo_slots, dwh_fb2_dl_mundo_slots |
| casino | 8 | apple, apptweak, fb2, google, snapchat, appsflyer, kochava, tiktok | dwh_apple_stardust_casino, dwh_apptweak_android_stardust_casino, dwh_apptweak_category_stardust_casino |

## Step 5 — Partial candidates: Meta only (no AppsFlyer, installs will be null)

| client_slug | platform_count | platforms |
|---|---|---|
| ads_insight | 1 | facebook |
| Friends | 1 | fb2 |
| breakdowns | 1 | fb2 |
| beyond | 1 | fb2 |
| sciplay | 1 | fb2 |
| antidote | 1 | fb2 |
| friend | 1 | fb2 |
| officesuite | 1 | fb2 |
| artzabox | 1 | fb2 |
| atidot | 1 | fb2 |
| bezikaron | 1 | fb2 |
| brix | 1 | fb2 |
| bspot | 1 | fb2 |
| caesars | 1 | fb2 |
| cakewalk | 1 | fb2 |
| royale | 1 | fb2 |
| cam | 1 | fb2 |
| arbitrage | 1 | fb2 |
| channel | 1 | fb2 |
| lighttricks | 1 | fb2 |

## Step 6 — Existing agent layer objects

| table_name | type |
|---|---|
| v_agent_globalcomix | BASE TABLE |
| v_playw3_agent | VIEW |

## Step 7 — Recommendation

**Best pick: `100play`**
- Platforms: fb2, appsflyer (2 total)
- Has Meta + AppsFlyer: installs and CPI will be real
- Tables: dwh_fb2_100play, dwh_fb2_ios14_appsflyer_100play, ods_appsflyer_patners_by_date_report_100play, ods_fb2_ads_100play, ods_fb2_creatives_100play
- Implementation path: UNION dwh_fb2_100play + appsflyer data, normalize to DashboardData shape

## Step 8 — All tables for recommended client `100play`

| table_name |
|---|
| dwh_fb2_100play |
| dwh_fb2_ios14_appsflyer_100play |
| ods_appsflyer_patners_by_date_report_100play |
| ods_fb2_ads_100play |
| ods_fb2_creatives_100play |
| ods_fb2_insight_age_gender_100play |
| ods_fb2_insight_general_web_100play |
| ods_fb2_insight_geo_web_100play |
| ods_fb2_insight_placement_web_100play |
| ods_fb2_ios14_insight_general_web_100play |
| ods_fb2_ios14_insight_geo_web_100play |
| ods_fb2_ios14_insight_placement_web_100play |