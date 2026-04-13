// version=v2026.04.13

const IGNORED_DIRS = [".git",".github","config","node_modules","__pycache__","Lychee","stefanzweifel"];

const CACHE_NAME = 'lab-full-app-v1-' + new Date().getTime();
const urlsToCache = [
    'index.html',
  'static/app_stylesheet.css',
  'manifest.json',
  'static/icons/icon-192x192.png',
  'static/icons/icon-512x512.png',
  '.ruff_cache/0.15.10/15274789502473331778',
  '.ruff_cache/0.15.10/16745208805549297326',
  '.ruff_cache/0.15.10/2091048453285411571',
  '.ruff_cache/0.15.10/8001291954108900101',
  '.ruff_cache/0.15.10/9665642407308259011',
  '.ruff_cache/CACHEDIR.TAG',
  'alphabet/data.js',
  'alphabet/index.html',
  'alphabet/preview.png',
  'alphabet/script.js',
  'alphabet/style.css',
  'animals/index.html',
  'animals/preview.png',
  'animals/script.js',
  'animals/style.css',
  'clock/index.html',
  'clock/preview.png',
  'clock/script.js',
  'clock/style.css',
  'color/data.js',
  'color/index.html',
  'color/preview.png',
  'color/script.js',
  'color/style.css',
  'company/charts_data.json',
  'company/company_data.json',
  'company/company_data_parser.py',
  'company/company_history.csv',
  'company/index.html',
  'company/keywords.txt',
  'company/preview.png',
  'company/requirements.txt',
  'company/script.js',
  'diff/index.html',
  'diff/preview.png',
  'hospitals/data/Aditya Birla Excluded_Hospitals_List.json',
  'hospitals/data/Bajaj General Excluded_Hospitals_List.json',
  'hospitals/data/Care Health Excluded_Hospitals_List.json',
  'hospitals/data/Go Digit Excluded_Hospitals_List.json',
  'hospitals/data/HDFC ERGO Excluded_Hospitals_List.json',
  'hospitals/data/ICICI Lombard Excluded_Hospitals_List.json',
  'hospitals/data/Manipal Cigna Excluded_Hospitals_List.json',
  'hospitals/data/Niva Bupa Excluded_Hospitals_List.json',
  'hospitals/data/Oriental Excluded_Hospitals_List.json',
  'hospitals/data/SBI General Excluded_Hospitals_List.json',
  'hospitals/data/Star Health Excluded_Hospitals_List.json',
  'hospitals/data/Tata AIG Excluded_Hospitals_List.json',
  'hospitals/data/excluded.json',
  'hospitals/data/innetwork.json',
  'hospitals/data/sources.json',
  'hospitals/index.html',
  'hospitals/preview.png',
  'hospitals/scripts/aditya_birla_data_parser.py',
  'hospitals/scripts/bajaj_general_data_parser.py',
  'hospitals/scripts/care_health_data_parser.py',
  'hospitals/scripts/go_digit_data_parser.py',
  'hospitals/scripts/hdfc_ergo_data_parser.py',
  'hospitals/scripts/icici_lombard_data_parser.py',
  'hospitals/scripts/manipal_cigna_data_parser.py',
  'hospitals/scripts/merge_data.py',
  'hospitals/scripts/niva_bupa_data_parser.py',
  'hospitals/scripts/oriental_data_parser.py',
  'hospitals/scripts/requirements.txt',
  'hospitals/scripts/sbi_general_data_parser.py',
  'hospitals/scripts/star_health_data_parser.py',
  'hospitals/scripts/tata_aig_data_parser.py',
  'hospitals/style.css',
  'ip/index.html',
  'ip/preview.png',
  'ip/script.js',
  'ip/style.css',
  'jobs/analyze-jobs.js',
  'jobs/charts_data.json',
  'jobs/classify-jobs.js',
  'jobs/constants.js',
  'jobs/fetch-jobs.js',
  'jobs/index.html',
  'jobs/jobs.json',
  'jobs/jobs.json.gz',
  'jobs/preview.png',
  'jobs/resourceLoader.js',
  'jobs/script.js',
  'jobs/style.css',
  'number/index.html',
  'number/preview.png',
  'number/script.js',
  'number/style.css',
  'pm-e-drive/data.json',
  'pm-e-drive/images/ather_energy_limited_ather_450s_hr_2W_L2.jpg',
  'pm-e-drive/images/ather_energy_limited_ather_450s_lr_2W_L2.jpg',
  'pm-e-drive/images/ather_energy_limited_ather_450x_hr_2W_L2.jpg',
  'pm-e-drive/images/ather_energy_limited_rizta_s_fx09_2W_L2.jpg',
  'pm-e-drive/images/ather_energy_limited_rizta_s_mx08_2W_L2.jpg',
  'pm-e-drive/images/ather_energy_limited_rizta_z_fx09_2W_L2.jpg',
  'pm-e-drive/images/bajaj_auto_limited_bajaj_gogo_c9009_3W_L5.jpg',
  'pm-e-drive/images/bajaj_auto_limited_bajaj_gogo_c9012_3W_L5.jpg',
  'pm-e-drive/images/bajaj_auto_limited_bajaj_gogo_p5012_3W_L5.jpg',
  'pm-e-drive/images/bajaj_auto_limited_bajaj_gogo_p9018_3W_L5.jpg',
  'pm-e-drive/images/bajaj_auto_limited_bajaj_gogo_p9018__d_5__3W_L5.jpg',
  'pm-e-drive/images/bajaj_auto_limited_bajaj_riki_c4005_3W_E-RICKSHAW & E-CART.jpg',
  'pm-e-drive/images/bajaj_auto_limited_bajaj_riki_p4005_3W_E-RICKSHAW & E-CART.jpg',
  'pm-e-drive/images/bajaj_auto_limited_bajaj_riki_p4006_3W_E-RICKSHAW & E-CART.jpg',
  'pm-e-drive/images/bajaj_auto_ltd_chetak_3001_2W_L1.jpg',
  'pm-e-drive/images/bajaj_auto_ltd_chetak_3501_2W_L2.jpg',
  'pm-e-drive/images/bajaj_auto_ltd_chetak_3502_2W_L2.jpg',
  'pm-e-drive/images/bajaj_auto_ltd_chetak_3503_2W_L1.jpg',
  'pm-e-drive/images/bajaj_auto_ltd_chetak_c20_01_2W_L1.jpg',
  'pm-e-drive/images/bajaj_auto_ltd_chetak_c25_01_2W_L1.jpg',
  'pm-e-drive/images/bajaj_auto_ltd_chetak_c30_01_2W_L1.jpg',
  'pm-e-drive/images/bajaj_auto_ltd_chetak_c35_01_2W_L2.jpg',
  'pm-e-drive/images/bajaj_auto_ltd_chetak_c35_02_2W_L2.jpg',
  'pm-e-drive/images/bajaj_auto_ltd_chetak_c35_03_2W_L1.jpg',
  'pm-e-drive/images/bajaj_auto_ltd_chetak_green_2501_2W_L1.jpg',
  'pm-e-drive/images/bgauss_auto_private_limited_c12_max_3_0_2W_L1.jpg',
  'pm-e-drive/images/bgauss_auto_private_limited_c12i_ex_2W_L1.jpg',
  'pm-e-drive/images/bgauss_auto_private_limited_c12i_max_2_0_2W_L1.jpg',
  'pm-e-drive/images/bgauss_auto_private_limited_oowah_ex_2W_L1.jpg',
  'pm-e-drive/images/bgauss_auto_private_limited_oowah_max_2W_L1.jpg',
  'pm-e-drive/images/bgauss_auto_private_limited_ruv_350_max_2W_L1.jpg',
  'pm-e-drive/images/bgauss_auto_private_limited_ruv_350i_ex_2W_L1.jpg',
  'pm-e-drive/images/bgauss_auto_private_limited_ruv_350i_max_2W_L1.jpg',
  'pm-e-drive/images/dilli_electric_auto_pvt_ltd_citylife_li-prima_3W_E-RICKSHAW & E-CART.jpg',
  'pm-e-drive/images/euler_motors_private_limited_hiload_ev_fbtr12lp__3W_L5.jpg',
  'pm-e-drive/images/euler_motors_private_limited_neo_hirange_3W_L5.jpg',
  'pm-e-drive/images/euler_motors_private_limited_neo_hirange_plus_3W_L5.jpg',
  'pm-e-drive/images/euler_motors_private_limited_neo_hirange_xr_3W_L5.jpg',
  'pm-e-drive/images/greaves_electric_mobility_limited_ampere_magnus_fe13a_2W_L1.jpg',
  'pm-e-drive/images/greaves_electric_mobility_limited_ampere_magnus_fe13b_2W_L1.jpg',
  'pm-e-drive/images/greaves_electric_mobility_limited_ampere_nexus_ex_2W_L2.jpg',
  'pm-e-drive/images/greaves_electric_mobility_limited_ampere_nexus_st_2W_L2.jpg',
  'pm-e-drive/images/greaves_electric_mobility_limited_magnus_ca_exb_lt_2W_L1.jpg',
  'pm-e-drive/images/greaves_electric_mobility_limited_magnus_grand_2W_L1.jpg',
  'pm-e-drive/images/greaves_electric_mobility_limited_magnus_neo_2W_L1.jpg',
  'pm-e-drive/images/hero_motocorp_limited_vida_v2_plus_2W_L2.jpg',
  'pm-e-drive/images/hero_motocorp_limited_vida_v2_pro_2W_L2.jpg',
  'pm-e-drive/images/hero_motocorp_limited_vida_vx2_go_2W_L2.jpg',
  'pm-e-drive/images/hero_motocorp_limited_vida_vx2_go_3_4_2W_L2.jpg',
  'pm-e-drive/images/hero_motocorp_limited_vida_vx2_plus_2W_L2.jpg',
  'pm-e-drive/images/kinetic_green_energy___power_solutions_ltd__e-luna_next_2W_L1.jpg',
  'pm-e-drive/images/kinetic_green_energy___power_solutions_ltd__e_luna_x3_go_2W_L1.jpg',
  'pm-e-drive/images/kinetic_green_energy___power_solutions_ltd__e_luna_x3_plus_2W_L1.jpg',
  'pm-e-drive/images/kinetic_green_energy___power_solutions_ltd__e_luna_x3_prime_2W_L1.jpg',
  'pm-e-drive/images/kinetic_green_energy___power_solutions_ltd__e_luna_x3_pro_2W_L1.jpg',
  'pm-e-drive/images/kinetic_green_energy___power_solutions_ltd__kinetic_safar_jumbo_ranger_-xp_3W_L5.jpg',
  'pm-e-drive/images/kinetic_green_energy___power_solutions_ltd__kinetic_safar_smart_next-e_3W_E-RICKSHAW & E-CART.jpg',
  'pm-e-drive/images/kinetic_green_energy___power_solutions_ltd__safar_shakti_li_3W_E-RICKSHAW & E-CART.jpg',
  'pm-e-drive/images/lectrix_e_vehicles_private_limited_andaaz_dhaakad_li_3W_E-RICKSHAW & E-CART.jpg',
  'pm-e-drive/images/lectrix_e_vehicles_private_limited_n-duro_2W_L1.jpg',
  'pm-e-drive/images/mahindra_last_mile_mobility_limited_zor_grand_fb_3W_L5.jpg',
  'pm-e-drive/images/mlr_auto_limited_greaves_eltra_city_xtra_3W_L5.jpg',
  'pm-e-drive/images/ola_electric_technologies_pvt_ltd_ola_roadster_x_7kw_2_5kwh_2W_L2.jpg',
  'pm-e-drive/images/ola_electric_technologies_pvt_ltd_ola_roadster_x_7kw_2_5kwh__o__2W_L2.jpg',
  'pm-e-drive/images/ola_electric_technologies_pvt_ltd_ola_roadster_x_7kw_3_5kwh_2W_L2.jpg',
  'pm-e-drive/images/ola_electric_technologies_pvt_ltd_ola_roadster_x_7kw_3_5kwh__o__2W_L2.jpg',
  'pm-e-drive/images/ola_electric_technologies_pvt_ltd_ola_roadster_x_7kw_4_5kwh_2W_L2.jpg',
  'pm-e-drive/images/ola_electric_technologies_pvt_ltd_ola_roadster_x_7kw_4_5kwh__o__2W_L2.jpg',
  'pm-e-drive/images/ola_electric_technologies_pvt_ltd_ola_roadster_x__11kw_4_5kwh_2W_L2.jpg',
  'pm-e-drive/images/ola_electric_technologies_pvt_ltd_ola_s1_pro__3_kwh__2W_L2.jpg',
  'pm-e-drive/images/ola_electric_technologies_pvt_ltd_ola_s1_pro__4_kwh__2W_L2.jpg',
  'pm-e-drive/images/ola_electric_technologies_pvt_ltd_ola_s1_pro__4kwh__2W_L2.jpg',
  'pm-e-drive/images/ola_electric_technologies_pvt_ltd_ola_s1_pro____4kwh__2W_L2.jpg',
  'pm-e-drive/images/ola_electric_technologies_pvt_ltd_ola_s1_x_2kwh__gen3__2W_L2.jpg',
  'pm-e-drive/images/ola_electric_technologies_pvt_ltd_ola_s1_x_3kwh__gen3__2W_L2.jpg',
  'pm-e-drive/images/ola_electric_technologies_pvt_ltd_ola_s1_x_4kwh__gen3__2W_L2.jpg',
  'pm-e-drive/images/ola_electric_technologies_pvt_ltd_ola_s1_x__4kwh__gen3__2W_L2.jpg',
  'pm-e-drive/images/piaggio_vehicles_private_limited_ape_e-_city_fx_max_3W_L5.jpg',
  'pm-e-drive/images/piaggio_vehicles_private_limited_ape_e-city_fx_ne_max_3W_L5.jpg',
  'pm-e-drive/images/piaggio_vehicles_private_limited_ape_e-city_ultra_3W_L5.jpg',
  'pm-e-drive/images/piaggio_vehicles_private_limited_ape_e-xtra_fx_ne_max_platform_3W_L5.jpg',
  'pm-e-drive/images/piaggio_vehicles_private_limited_ape_e-xtra_fx_ne_max_pu_3W_L5.jpg',
  'pm-e-drive/images/revolt_intellicorp_private_limited_rv1__2W_L1.jpg',
  'pm-e-drive/images/revolt_intellicorp_private_limited_rv400_2W_L2.jpg',
  'pm-e-drive/images/revolt_intellicorp_private_limited_rv400_brz_2W_L2.jpg',
  'pm-e-drive/images/revolt_intellicorp_private_limited_rv_blazex_2W_L2.jpg',
  'pm-e-drive/images/river_mobility_private_limited_indie_2W_L2.jpg',
  'pm-e-drive/images/simpleenergy_private_limited_simple_one_2W_L2.jpg',
  'pm-e-drive/images/simpleenergy_private_limited_simple_ones_2W_L2.jpg',
  'pm-e-drive/images/terra_motors_india_pvt_ltd__kyoro__3W_L5.jpg',
  'pm-e-drive/images/terra_motors_india_pvt_ltd__kyoro___with_amara_raja_battery__3W_L5.jpg',
  'pm-e-drive/images/terra_motors_india_pvt_ltd__kyoro___with_electra_ev__battery__3W_L5.jpg',
  'pm-e-drive/images/terra_motors_india_pvt_ltd__y4a_pro_3W_E-RICKSHAW & E-CART.jpg',
  'pm-e-drive/images/ti_clean_mobility_private_limited_montra_electric_ecx_3W_L5.jpg',
  'pm-e-drive/images/ti_clean_mobility_private_limited_montra_electric_ecx_d_3W_L5.jpg',
  'pm-e-drive/images/ti_clean_mobility_private_limited_montra_electric_ecx_d__3W_L5.jpg',
  'pm-e-drive/images/ti_clean_mobility_private_limited_montra_electric_epl_2_0_3W_L5.jpg',
  'pm-e-drive/images/ti_clean_mobility_private_limited_montra_electric_epl_2_0_r_3W_L5.jpg',
  'pm-e-drive/images/ti_clean_mobility_private_limited_montra_electric_erl51_3W_E-RICKSHAW & E-CART.jpg',
  'pm-e-drive/images/tvs_motor_company_limited_tvs_iqube_electric_smartxonnect_11_2W_L2.jpg',
  'pm-e-drive/images/tvs_motor_company_limited_tvs_king_ep4_3W_L5.jpg',
  'pm-e-drive/images/tvs_motor_company_limited_tvs_orbiter_v1_2W_L1.jpg',
  'pm-e-drive/images/tvs_motor_company_limited_tvs_orbiter_v2_2W_L1.jpg',
  'pm-e-drive/index.html',
  'pm-e-drive/models_data_parser.py',
  'pm-e-drive/preview.png',
  'polyforge/index.html',
  'polyforge/preview.png',
  'polyforge/script.js',
  'serviceability/data/availability.json',
  'serviceability/data/availability_1mg.json',
  'serviceability/data/availability_ap.json',
  'serviceability/data/availability_bb.json',
  'serviceability/data/availability_bk.json',
  'serviceability/data/availability_dm.json',
  'serviceability/data/availability_fh.json',
  'serviceability/data/availability_im.json',
  'serviceability/data/availability_jio.json',
  'serviceability/data/availability_lcs.json',
  'serviceability/data/availability_pe.json',
  'serviceability/data/availability_sw.json',
  'serviceability/data/availability_zm.json',
  'serviceability/data/availability_zo.json',
  'serviceability/data/india_districts.geojson',
  'serviceability/data/pincodes_latlng.json',
  'serviceability/index.html',
  'serviceability/maps/apollo 24|7.json',
  'serviceability/maps/apollo 24|7.png',
  'serviceability/maps/apollo 24|7.webp',
  'serviceability/maps/bigbasket.json',
  'serviceability/maps/bigbasket.png',
  'serviceability/maps/bigbasket.webp',
  'serviceability/maps/blinkit.json',
  'serviceability/maps/blinkit.png',
  'serviceability/maps/blinkit.webp',
  'serviceability/maps/bounds.json',
  'serviceability/maps/dmart ready.json',
  'serviceability/maps/dmart ready.png',
  'serviceability/maps/dmart ready.webp',
  'serviceability/maps/freshtohome.json',
  'serviceability/maps/freshtohome.png',
  'serviceability/maps/freshtohome.webp',
  'serviceability/maps/instamart.json',
  'serviceability/maps/instamart.png',
  'serviceability/maps/instamart.webp',
  'serviceability/maps/jiomart.json',
  'serviceability/maps/jiomart.png',
  'serviceability/maps/jiomart.webp',
  'serviceability/maps/licious.json',
  'serviceability/maps/licious.png',
  'serviceability/maps/licious.webp',
  'serviceability/maps/pharmeasy.json',
  'serviceability/maps/pharmeasy.png',
  'serviceability/maps/pharmeasy.webp',
  'serviceability/maps/swiggy.json',
  'serviceability/maps/swiggy.png',
  'serviceability/maps/swiggy.webp',
  'serviceability/maps/tata 1mg.json',
  'serviceability/maps/tata 1mg.png',
  'serviceability/maps/tata 1mg.webp',
  'serviceability/maps/zepto.json',
  'serviceability/maps/zepto.png',
  'serviceability/maps/zepto.webp',
  'serviceability/maps/zomato.json',
  'serviceability/maps/zomato.png',
  'serviceability/maps/zomato.webp',
  'serviceability/preview.png',
  'serviceability/script.js',
  'serviceability/scripts/1mg_checker.py',
  'serviceability/scripts/ap_checker.py',
  'serviceability/scripts/bb_checker.py',
  'serviceability/scripts/bk_checker.py',
  'serviceability/scripts/dm_checker.py',
  'serviceability/scripts/fetch_pincode_coords.py',
  'serviceability/scripts/fh_checker.py',
  'serviceability/scripts/im_checker.py',
  'serviceability/scripts/jio_checker.py',
  'serviceability/scripts/ls_checker.py',
  'serviceability/scripts/merge_data.py',
  'serviceability/scripts/pe_checker.py',
  'serviceability/scripts/render_map.py',
  'serviceability/scripts/requirements.txt',
  'serviceability/scripts/sw_checker.py',
  'serviceability/scripts/utils.py',
  'serviceability/scripts/workflow_requirements.txt',
  'serviceability/scripts/zm_checker.py',
  'serviceability/scripts/zo_checker.py',
  'serviceability/style.css',
  'shapes/index.html',
  'shapes/preview.png',
  'shapes/script.js',
  'shapes/style.css',
  'smart-dom-inspector/index.html',
  'smart-dom-inspector/locator_helper.js',
  'smart-dom-inspector/preview.png',
  'smart-dom-inspector/script.js',
  'smart-dom-inspector/style.css',
  'static/app_script.js',
  'static/icons/ico/android-icon-144x144.png',
  'static/icons/ico/android-icon-192x192.png',
  'static/icons/ico/android-icon-36x36.png',
  'static/icons/ico/android-icon-48x48.png',
  'static/icons/ico/android-icon-72x72.png',
  'static/icons/ico/android-icon-96x96.png',
  'static/icons/ico/apple-icon-114x114.png',
  'static/icons/ico/apple-icon-120x120.png',
  'static/icons/ico/apple-icon-144x144.png',
  'static/icons/ico/apple-icon-152x152.png',
  'static/icons/ico/apple-icon-180x180.png',
  'static/icons/ico/apple-icon-57x57.png',
  'static/icons/ico/apple-icon-60x60.png',
  'static/icons/ico/apple-icon-72x72.png',
  'static/icons/ico/apple-icon-76x76.png',
  'static/icons/ico/apple-icon-precomposed.png',
  'static/icons/ico/apple-icon.png',
  'static/icons/ico/browserconfig.xml',
  'static/icons/ico/favicon-16x16.png',
  'static/icons/ico/favicon-32x32.png',
  'static/icons/ico/favicon-96x96.png',
  'static/icons/ico/favicon.ico',
  'static/icons/ico/ms-icon-144x144.png',
  'static/icons/ico/ms-icon-150x150.png',
  'static/icons/ico/ms-icon-310x310.png',
  'static/icons/ico/ms-icon-70x70.png',
  'static/icons/settings-open.svg',
  'static/icons/settings.svg',
  'static/images/buffalo_1.jpg',
  'static/images/buffalo_2.jpg',
  'static/images/buffalo_3.jpg',
  'static/images/buffalo_4.jpg',
  'static/images/buffalo_5.jpg',
  'static/images/camel_1.jpg',
  'static/images/camel_2.jpg',
  'static/images/camel_3.jpg',
  'static/images/camel_4.jpg',
  'static/images/camel_5.jpg',
  'static/images/cat_1.jpg',
  'static/images/cat_2.jpg',
  'static/images/cat_3.jpg',
  'static/images/cat_4.jpg',
  'static/images/cat_5.jpg',
  'static/images/chicken_1.jpg',
  'static/images/chicken_2.jpg',
  'static/images/chicken_3.jpg',
  'static/images/chicken_4.jpg',
  'static/images/chicken_5.jpg',
  'static/images/cow_1.jpg',
  'static/images/cow_2.jpg',
  'static/images/cow_3.jpg',
  'static/images/cow_4.jpg',
  'static/images/cow_5.jpg',
  'static/images/cow_6.jpg',
  'static/images/crow_1.jpg',
  'static/images/crow_2.jpg',
  'static/images/crow_3.jpg',
  'static/images/crow_4.jpg',
  'static/images/crow_5.jpg',
  'static/images/crow_6.jpg',
  'static/images/dog_1.jpg',
  'static/images/dog_2.jpg',
  'static/images/dog_3.jpg',
  'static/images/dog_4.jpg',
  'static/images/dog_5.jpg',
  'static/images/dog_6.jpg',
  'static/images/dog_7.jpg',
  'static/images/donkey_1.jpg',
  'static/images/donkey_2.jpg',
  'static/images/donkey_3.jpg',
  'static/images/donkey_4.jpg',
  'static/images/donkey_5.jpg',
  'static/images/duck_1.jpg',
  'static/images/duck_2.jpg',
  'static/images/duck_3.jpg',
  'static/images/duck_4.jpg',
  'static/images/duck_5.jpg',
  'static/images/duck_6.jpg',
  'static/images/elephant_1.jpg',
  'static/images/elephant_2.jpg',
  'static/images/elephant_3.jpg',
  'static/images/elephant_4.jpg',
  'static/images/elephant_5.jpg',
  'static/images/flag.png',
  'static/images/goat_1.jpg',
  'static/images/goat_2.jpg',
  'static/images/goat_3.jpg',
  'static/images/goat_4.jpg',
  'static/images/goat_5.jpg',
  'static/images/horse_1.jpg',
  'static/images/horse_2.jpg',
  'static/images/horse_3.jpg',
  'static/images/horse_4.jpg',
  'static/images/horse_5.jpg',
  'static/images/ox_1.jpg',
  'static/images/ox_2.jpg',
  'static/images/ox_3.jpg',
  'static/images/ox_4.jpg',
  'static/images/ox_5.jpg',
  'static/images/parrot_1.jpg',
  'static/images/parrot_2.jpg',
  'static/images/parrot_3.jpg',
  'static/images/parrot_4.jpg',
  'static/images/parrot_5.jpg',
  'static/images/pigeon_1.jpg',
  'static/images/pigeon_2.jpg',
  'static/images/pigeon_3.jpg',
  'static/images/pigeon_4.jpg',
  'static/images/pigeon_5.jpg',
  'static/images/rabbit_1.jpg',
  'static/images/rabbit_2.jpg',
  'static/images/rabbit_3.jpg',
  'static/images/rabbit_4.jpg',
  'static/images/rabbit_5.jpg',
  'static/images/rooster_1.jpg',
  'static/images/rooster_2.jpg',
  'static/images/rooster_3.jpg',
  'static/images/rooster_4.jpg',
  'static/images/rooster_5.jpg',
  'static/images/sheep_1.jpg',
  'static/images/sheep_2.jpg',
  'static/images/sheep_3.jpg',
  'static/images/sheep_4.jpg',
  'static/images/sheep_5.jpg',
  'static/images/sparrow_1.jpg',
  'static/images/sparrow_2.jpg',
  'static/images/sparrow_3.jpg',
  'static/images/sparrow_4.jpg',
  'static/images/sparrow_5.jpg',
  'static/settings.css',
  'static/speech_helper.js',
  'static/utils.js',
  'type/index.html',
  'type/preview.png',
  'type/script.js',
  'whistle-counter/index.html',
  'words/data.js',
  'words/index.html',
  'words/preview.png',
  'words/script.js',
  'words/style.css',
  'world/country_data.json',
  'world/index.html',
  'world/js/d3-geo-projection.min.js',
  'world/js/d3.v7.min.js',
  'world/js/topojson-client.min.js',
  'world/map_data.json',
  'world/map_data_parser.py',
  'world/preview.png',
  'world/script.js'
];

const ALLOWED_CDN_HOSTS = new Set([
  "cdn.datatables.net",
  "cdnjs.cloudflare.com",
  "cdn.jsdelivr.net",
  "unpkg.com",
]);

const duplicates = urlsToCache.filter(
  (item, index, arr) => arr.indexOf(item) !== index,
);
if (duplicates.length > 0) {
  console.warn("[SW] Duplicate URLs detected in cache list:", duplicates);
}

self.addEventListener("install", (event) => {
  console.log("[SW] Installing and caching:", CACHE_NAME);

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[SW] Caching app shell...");

      // Map each URL to a Promise for cache.add()
      const cachePromises = urlsToCache.map((url) => {
        return cache
          .add(url)
          .then(() => ({ status: "fulfilled", url }))
          .catch((error) => ({ status: "rejected", url, error }));
      });

      // Wait for all caching attempts to finish (settle)
      return Promise.allSettled(cachePromises).then((results) => {
        const failed = results.filter((result) => result.status === "rejected");
        const successful = results.filter(
          (result) => result.status === "fulfilled",
        );

        console.log("[SW] Successfully cached", successful.length, "resources");
        if (failed.length > 0) {
          console.error(
            "[SW]",
            failed.length,
            "resources failed to cache:",
            failed,
          );
        }

        // ONLY AFTER CACHING IS COMPLETE, THEN SKIP WAITING
        self.skipWaiting();
      });
    })
  );
});

self.addEventListener("activate", (event) => {
  console.log("[SW] Activating:", CACHE_NAME);
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((name) => {
            if (name !== CACHE_NAME) {
              console.log("[SW] Deleting old cache:", name);
              return caches.delete(name);
            }
          })
        )
      )
      .then(() => {
        console.log("[SW] Activation complete. Claiming clients...");
        self.clients.claim();
      })
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Exit early: only handle safe, HTTP(S), GET requests
  if (req.method !== "GET") {
    return;
  }
  // Filter protocol to only http requests
  const url = new URL(req.url);
  if (!["http:", "https:"].includes(url.protocol)) {
    return;
  }

  // skip range/credentialed requests to avoid side effects
  if (req.headers.has("range")) {
    return;
  }
  if (req.credentials === "include") {
    return;
  }

  // Domain lockdown for GitHub Pages
  const ONLY_CURRENT_HOST = true;
  const isSameOrigin = url.origin === self.location.origin;
  const isGithubPagesHost = url.hostname.endsWith(".github.io");
  const isAllowedOrigin = ONLY_CURRENT_HOST
    ? url.hostname === self.location.hostname
    : isSameOrigin || isGithubPagesHost;

  const isAllowedCdn =
    typeof ALLOWED_CDN_HOSTS !== "undefined" &&
    ALLOWED_CDN_HOSTS.has(url.hostname);

  if (!isAllowedOrigin && !isAllowedCdn) {
    return;
  }

  const normalizedPath = url.pathname.replace(/^\/|\/$/g, "");

  // MAIN FETCH HANDLER
  event.respondWith(
    (async () => {
      try {
      // Ignore List Check
        const ignoreList = Array.isArray(IGNORED_DIRS) ? IGNORED_DIRS : [];
        const isIgnored = ignoreList.some((dir) => {
          const cleanDir = String(dir).replace(/^\/|\/$/g, "");
          return (
            normalizedPath === cleanDir ||
            normalizedPath.startsWith(cleanDir + "/")
          );
        });

        if (isIgnored) {
          return fetch(req); // Don't cache, just fetch
        }

        // Cache List Check
        const cacheList = Array.isArray(urlsToCache) ? urlsToCache : [];
        const shouldBeCached = cacheList.some((path) => {
          const cleanPath = String(path).replace(/^\/|\/$/g, "");
          // Match exact path OR map root/empty path to index.html
          return (
            normalizedPath === cleanPath ||
            (normalizedPath === "" &&
              (cleanPath === "index.html" || cleanPath === ""))
          );
        });

        if (shouldBeCached) {
          const cache = await caches.open(CACHE_NAME);
          const cachedResponse = await cache.match(req);

          // Network revalidation (Stale-While-Revalidate)
          const networkFetch = fetch(req)
            .then(async (fresh) => {
              const isCacheableType =
                fresh.type === "basic" || fresh.type === "cors";
              if (fresh.ok && isCacheableType) {
                // Save to cache the latest response
                await cache.put(req, fresh.clone());
              }
              return fresh;
            })
            .catch(() => null);

          if (cachedResponse) {
            // Return cached version immediately and Update cache in background
            event.waitUntil(networkFetch);
            return cachedResponse;
          }

          // If not in cache, wait for network
          const freshResponse = await networkFetch;
          if (freshResponse) {
            return freshResponse;
          }

          // Final offline fallback if network fails and no cache exists
          return new Response("Offline content not available", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          });
        }

        // Default: Not in cache list, try network and fallback to cache if available
        return fetch(req).catch(() => caches.match(req));
      } catch (err) {
        console.warn("[SW] Fetch error:", err);
        // Last resort: try cache, then network
        return (await caches.match(req)) || fetch(req);
      }
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.action === "skipWaiting") {
    console.log("[SW] Skipping waiting...");
    self.skipWaiting();
  }
});