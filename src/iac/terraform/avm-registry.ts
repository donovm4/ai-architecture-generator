/**
 * AVM Terraform Module Registry
 *
 * Maps architecture resource type keys to Azure Verified Module (AVM)
 * Terraform module sources.
 *
 * Source format: "Azure/avm-res-<provider>-<resource>/azurerm"
 * Registry: https://registry.terraform.io/namespaces/Azure
 *
 * Versions verified against registry on 2026-02-23.
 */

import type { AvmTerraformModuleRef } from '../types.js';

export const AVM_TERRAFORM_MODULES: Record<string, AvmTerraformModuleRef> = {
  // ==================== NETWORKING ====================
  vnet: {
    source: 'Azure/avm-res-network-virtualnetwork/azurerm',
    version: '0.7.1',
    requiredVars: ['name', 'location', 'resource_group_name', 'address_space'],
    optionalVars: ['subnets', 'tags'],
    azurermResourceType: 'azurerm_virtual_network',
  },
  hubVnet: {
    source: 'Azure/avm-res-network-virtualnetwork/azurerm',
    version: '0.7.1',
    requiredVars: ['name', 'location', 'resource_group_name', 'address_space'],
    optionalVars: ['subnets', 'tags'],
    azurermResourceType: 'azurerm_virtual_network',
  },
  nsg: {
    source: 'Azure/avm-res-network-networksecuritygroup/azurerm',
    version: '0.3.0',
    requiredVars: ['name', 'location', 'resource_group_name'],
    optionalVars: ['security_rules', 'tags'],
    azurermResourceType: 'azurerm_network_security_group',
  },
  loadBalancer: {
    source: 'Azure/avm-res-network-loadbalancer/azurerm',
    version: '0.5.0',
    requiredVars: ['name', 'location', 'resource_group_name', 'frontend_ip_configurations'],
    optionalVars: ['tags'],
    azurermResourceType: 'azurerm_lb',
  },
  firewall: {
    source: 'Azure/avm-res-network-azurefirewall/azurerm',
    version: '0.3.0',
    requiredVars: ['name', 'location', 'resource_group_name', 'firewall_sku_name', 'firewall_sku_tier'],
    optionalVars: ['firewall_policy_id', 'firewall_zones', 'tags'],
    azurermResourceType: 'azurerm_firewall',
  },
  bastion: {
    source: 'Azure/avm-res-network-bastionhost/azurerm',
    version: '0.4.0',
    requiredVars: ['name', 'location', 'resource_group_name'],
    optionalVars: ['sku', 'tags'],
    azurermResourceType: 'azurerm_bastion_host',
  },
  publicIp: {
    source: 'Azure/avm-res-network-publicipaddress/azurerm',
    version: '0.2.0',
    requiredVars: ['name', 'location', 'resource_group_name'],
    optionalVars: ['sku', 'allocation_method', 'tags'],
    azurermResourceType: 'azurerm_public_ip',
  },
  privateEndpoint: {
    source: 'Azure/avm-res-network-privateendpoint/azurerm',
    version: '0.2.0',
    requiredVars: ['name', 'location', 'resource_group_name', 'subnet_resource_id'],
    optionalVars: ['private_service_connection', 'tags'],
    azurermResourceType: 'azurerm_private_endpoint',
  },
  nat: {
    source: 'Azure/avm-res-network-natgateway/azurerm',
    version: '0.3.2',
    requiredVars: ['name', 'location', 'resource_group_name'],
    optionalVars: ['zones', 'tags'],
    azurermResourceType: 'azurerm_nat_gateway',
  },
  routeTable: {
    source: 'Azure/avm-res-network-routetable/azurerm',
    version: '0.3.0',
    requiredVars: ['name', 'location', 'resource_group_name'],
    optionalVars: ['routes', 'tags'],
    azurermResourceType: 'azurerm_route_table',
  },
  dns: {
    source: 'Azure/avm-res-network-dnszone/azurerm',
    version: '0.2.1',
    requiredVars: ['domain_name', 'resource_group_name'],
    optionalVars: ['tags'],
    azurermResourceType: 'azurerm_dns_zone',
  },
  privateDns: {
    source: 'Azure/avm-res-network-privatednszone/azurerm',
    version: '0.5.0',
    requiredVars: ['domain_name', 'resource_group_name'],
    optionalVars: ['virtual_network_links', 'tags'],
    azurermResourceType: 'azurerm_private_dns_zone',
  },
  // vpnGateway: No TF AVM module exists — falls back to azurerm_virtual_network_gateway
  appGateway: {
    source: 'Azure/avm-res-network-applicationgateway/azurerm',
    version: '0.5.2',
    requiredVars: ['name', 'location', 'resource_group_name'],
    optionalVars: ['sku', 'tags'],
    azurermResourceType: 'azurerm_application_gateway',
  },
  trafficManager: {
    source: 'Azure/avm-res-network-trafficmanagerprofile/azurerm',
    version: '0.1.0',
    requiredVars: ['name', 'resource_group_name'],
    optionalVars: ['traffic_routing_method', 'tags'],
    azurermResourceType: 'azurerm_traffic_manager_profile',
  },

  // ==================== COMPUTE ====================
  vm: {
    source: 'Azure/avm-res-compute-virtualmachine/azurerm',
    version: '0.20.0',
    requiredVars: ['name', 'location', 'resource_group_name', 'os_type', 'zone', 'network_interfaces'],
    optionalVars: ['sku_size', 'admin_username', 'tags'],
    azurermResourceType: 'azurerm_linux_virtual_machine',
  },
  // vmss: Moved to fallback — AVM module has complex interface (parent_id, extension_protected_setting, user_data_base64)
  aks: {
    source: 'Azure/avm-res-containerservice-managedcluster/azurerm',
    version: '0.3.3',
    requiredVars: ['name', 'location', 'resource_group_name', 'default_node_pool'],
    optionalVars: ['kubernetes_version', 'tags'],
    azurermResourceType: 'azurerm_kubernetes_cluster',
  },
  containerRegistry: {
    source: 'Azure/avm-res-containerregistry-registry/azurerm',
    version: '0.5.1',
    requiredVars: ['name', 'location', 'resource_group_name'],
    optionalVars: ['sku', 'admin_enabled', 'tags'],
    azurermResourceType: 'azurerm_container_registry',
  },
  containerApp: {
    source: 'Azure/avm-res-app-containerapp/azurerm',
    version: '0.7.4',
    requiredVars: ['name', 'resource_group_name', 'container_app_environment_resource_id'],
    optionalVars: ['template', 'tags'],
    azurermResourceType: 'azurerm_container_app',
  },
  containerAppEnv: {
    source: 'Azure/avm-res-app-managedenvironment/azurerm',
    version: '0.4.0',
    requiredVars: ['name', 'location', 'resource_group_name'],
    optionalVars: ['log_analytics_workspace', 'tags'],
    azurermResourceType: 'azurerm_container_app_environment',
  },
  appService: {
    source: 'Azure/avm-res-web-site/azurerm',
    version: '0.20.0',
    requiredVars: ['name', 'location', 'resource_group_name', 'os_type', 'kind', 'service_plan_resource_id'],
    optionalVars: ['site_config', 'tags'],
    azurermResourceType: 'azurerm_linux_web_app',
  },
  functionApp: {
    source: 'Azure/avm-res-web-site/azurerm',
    version: '0.20.0',
    requiredVars: ['name', 'location', 'resource_group_name', 'os_type', 'kind', 'service_plan_resource_id'],
    optionalVars: ['site_config', 'tags'],
    azurermResourceType: 'azurerm_linux_function_app',
  },
  appServicePlan: {
    source: 'Azure/avm-res-web-serverfarm/azurerm',
    version: '1.0.0',
    requiredVars: ['name', 'location', 'resource_group_name', 'os_type'],
    optionalVars: ['sku_name', 'tags'],
    azurermResourceType: 'azurerm_service_plan',
  },

  // ==================== STORAGE ====================
  storageAccount: {
    source: 'Azure/avm-res-storage-storageaccount/azurerm',
    version: '0.6.7',
    requiredVars: ['name', 'location', 'resource_group_name'],
    optionalVars: ['account_tier', 'account_replication_type', 'tags'],
    azurermResourceType: 'azurerm_storage_account',
  },

  // ==================== DATABASES ====================
  cosmosDb: {
    source: 'Azure/avm-res-documentdb-databaseaccount/azurerm',
    version: '0.10.0',
    requiredVars: ['name', 'location', 'resource_group_name', 'geo_locations'],
    optionalVars: ['consistency_policy', 'sql_databases', 'mongo_databases', 'tags'],
    azurermResourceType: 'azurerm_cosmosdb_account',
  },
  sqlServer: {
    source: 'Azure/avm-res-sql-server/azurerm',
    version: '0.1.6',
    requiredVars: ['name', 'location', 'resource_group_name', 'server_version'],
    optionalVars: ['administrator_login', 'databases', 'tags'],
    azurermResourceType: 'azurerm_mssql_server',
  },
  postgresql: {
    source: 'Azure/avm-res-dbforpostgresql-flexibleserver/azurerm',
    version: '0.2.0',
    requiredVars: ['name', 'location', 'resource_group_name'],
    optionalVars: ['sku_name', 'version', 'storage_mb', 'tags'],
    azurermResourceType: 'azurerm_postgresql_flexible_server',
  },
  postgresqlFlex: {
    source: 'Azure/avm-res-dbforpostgresql-flexibleserver/azurerm',
    version: '0.2.0',
    requiredVars: ['name', 'location', 'resource_group_name'],
    optionalVars: ['sku_name', 'version', 'storage_mb', 'tags'],
    azurermResourceType: 'azurerm_postgresql_flexible_server',
  },
  mysql: {
    source: 'Azure/avm-res-dbformysql-flexibleserver/azurerm',
    version: '0.1.5',
    requiredVars: ['name', 'location', 'resource_group_name'],
    optionalVars: ['sku_name', 'version', 'storage_mb', 'tags'],
    azurermResourceType: 'azurerm_mysql_flexible_server',
  },
  redis: {
    source: 'Azure/avm-res-cache-redis/azurerm',
    version: '0.4.0',
    requiredVars: ['name', 'location', 'resource_group_name'],
    optionalVars: ['sku_name', 'capacity', 'tags'],
    azurermResourceType: 'azurerm_redis_cache',
  },

  // ==================== SECURITY ====================
  keyVault: {
    source: 'Azure/avm-res-keyvault-vault/azurerm',
    version: '0.10.0',
    requiredVars: ['name', 'location', 'resource_group_name', 'tenant_id'],
    optionalVars: ['sku_name', 'tags'],
    azurermResourceType: 'azurerm_key_vault',
  },

  // ==================== INTEGRATION ====================
  serviceBus: {
    source: 'Azure/avm-res-servicebus-namespace/azurerm',
    version: '0.4.0',
    requiredVars: ['name', 'location', 'resource_group_name'],
    optionalVars: ['sku', 'queues', 'topics', 'tags'],
    azurermResourceType: 'azurerm_servicebus_namespace',
  },
  eventHub: {
    source: 'Azure/avm-res-eventhub-namespace/azurerm',
    version: '0.1.0',
    requiredVars: ['name', 'location', 'resource_group_name'],
    optionalVars: ['sku', 'eventhubs', 'tags'],
    azurermResourceType: 'azurerm_eventhub_namespace',
  },
  apiManagement: {
    source: 'Azure/avm-res-apimanagement-service/azurerm',
    version: '0.0.7',
    requiredVars: ['name', 'location', 'resource_group_name', 'publisher_email', 'publisher_name'],
    optionalVars: ['sku_name', 'tags'],
    azurermResourceType: 'azurerm_api_management',
  },
  // appConfig: No TF AVM module exists — falls back to azurerm_app_configuration
  // signalR: No TF AVM module exists — falls back to azurerm_signalr_service

  // ==================== AI / ML ====================
  openAI: {
    source: 'Azure/avm-res-cognitiveservices-account/azurerm',
    version: '0.11.0',
    requiredVars: ['name', 'location', 'parent_id', 'kind', 'sku_name'],
    optionalVars: ['deployments', 'tags'],
    azurermResourceType: 'azurerm_cognitive_account',
  },
  cognitiveServices: {
    source: 'Azure/avm-res-cognitiveservices-account/azurerm',
    version: '0.11.0',
    requiredVars: ['name', 'location', 'parent_id', 'kind', 'sku_name'],
    optionalVars: ['tags'],
    azurermResourceType: 'azurerm_cognitive_account',
  },
  aiSearch: {
    source: 'Azure/avm-res-search-searchservice/azurerm',
    version: '0.2.0',
    requiredVars: ['name', 'location', 'resource_group_name'],
    optionalVars: ['sku', 'tags'],
    azurermResourceType: 'azurerm_search_service',
  },
  machineLearning: {
    source: 'Azure/avm-res-machinelearningservices-workspace/azurerm',
    version: '0.9.0',
    requiredVars: ['name', 'location', 'resource_group_name'],
    optionalVars: ['sku_name', 'tags'],
    azurermResourceType: 'azurerm_machine_learning_workspace',
  },

  // ==================== ANALYTICS ====================
  databricks: {
    source: 'Azure/avm-res-databricks-workspace/azurerm',
    version: '0.2.0',
    requiredVars: ['name', 'location', 'resource_group_name', 'sku'],
    optionalVars: ['tags'],
    azurermResourceType: 'azurerm_databricks_workspace',
  },
  dataFactory: {
    source: 'Azure/avm-res-datafactory-factory/azurerm',
    version: '0.1.0',
    requiredVars: ['name', 'location', 'resource_group_name'],
    optionalVars: ['tags'],
    azurermResourceType: 'azurerm_data_factory',
  },

  // ==================== MONITORING ====================
  logAnalytics: {
    source: 'Azure/avm-res-operationalinsights-workspace/azurerm',
    version: '0.5.1',
    requiredVars: ['name', 'location', 'resource_group_name'],
    optionalVars: ['log_analytics_workspace_sku', 'log_analytics_workspace_retention_in_days', 'tags'],
    azurermResourceType: 'azurerm_log_analytics_workspace',
  },

  // ==================== MANAGEMENT ====================
  recoveryVault: {
    source: 'Azure/avm-res-recoveryservices-vault/azurerm',
    version: '0.3.0',
    requiredVars: ['name', 'location', 'resource_group_name'],
    optionalVars: ['sku', 'tags'],
    azurermResourceType: 'azurerm_recovery_services_vault',
  },
  managedIdentity: {
    source: 'Azure/avm-res-managedidentity-userassignedidentity/azurerm',
    version: '0.4.0',
    requiredVars: ['name', 'location', 'resource_group_name'],
    optionalVars: ['tags'],
    azurermResourceType: 'azurerm_user_assigned_identity',
  },
  automationAccount: {
    source: 'Azure/avm-res-automation-automationaccount/azurerm',
    version: '0.2.0',
    requiredVars: ['name', 'location', 'resource_group_name'],
    optionalVars: ['sku_name', 'tags'],
    azurermResourceType: 'azurerm_automation_account',
  },
};

/** Check if a resource type has an AVM Terraform module */
export function hasAvmTerraformModule(resourceType: string): boolean {
  return resourceType in AVM_TERRAFORM_MODULES;
}

/** Get the AVM Terraform module reference, or undefined */
export function getAvmTerraformModule(resourceType: string): AvmTerraformModuleRef | undefined {
  return AVM_TERRAFORM_MODULES[resourceType];
}

/**
 * Fallback azurerm resource types for resource types without AVM modules.
 */
export const AZURERM_FALLBACK_RESOURCES: Record<string, string> = {
  subnet: 'azurerm_subnet',
  vmss: 'azurerm_linux_virtual_machine_scale_set',
  vpnGateway: 'azurerm_virtual_network_gateway',
  asg: 'azurerm_application_security_group',
  firewallPolicy: 'azurerm_firewall_policy',
  waf: 'azurerm_web_application_firewall_policy',
  frontDoor: 'azurerm_cdn_frontdoor_profile',
  cdn: 'azurerm_cdn_profile',
  ddosProtection: 'azurerm_network_ddos_protection_plan',
  expressRoute: 'azurerm_express_route_circuit',
  vwan: 'azurerm_virtual_wan',
  vhub: 'azurerm_virtual_hub',
  privateLink: 'azurerm_private_link_service',
  networkWatcher: 'azurerm_network_watcher',
  containerInstance: 'azurerm_container_group',
  avd: 'azurerm_virtual_desktop_host_pool',
  disk: 'azurerm_managed_disk',
  serviceFabric: 'azurerm_service_fabric_cluster',
  batch: 'azurerm_batch_account',
  dataLake: 'azurerm_data_lake_store',
  netAppFiles: 'azurerm_netapp_account',
  sqlDatabase: 'azurerm_mssql_database',
  sqlManagedInstance: 'azurerm_mssql_managed_instance',
  dataExplorer: 'azurerm_kusto_cluster',
  purview: 'azurerm_purview_account',
  sentinel: 'azurerm_sentinel_log_analytics_workspace_onboarding',
  defender: 'azurerm_security_center_subscription_pricing',
  logicApp: 'azurerm_logic_app_workflow',
  eventGrid: 'azurerm_eventgrid_topic',
  integrationAccount: 'azurerm_logic_app_integration_account',
  relay: 'azurerm_relay_namespace',
  botService: 'azurerm_bot_channels_registration',
  synapse: 'azurerm_synapse_workspace',
  streamAnalytics: 'azurerm_stream_analytics_job',
  hdInsight: 'azurerm_hdinsight_spark_cluster',
  analysisServices: 'azurerm_analysis_services_server',
  appInsights: 'azurerm_application_insights',
  appConfig: 'azurerm_app_configuration',
  signalR: 'azurerm_signalr_service',
  monitor: 'azurerm_monitor_workspace',
  actionGroup: 'azurerm_monitor_action_group',
  grafana: 'azurerm_dashboard_grafana',
  azureAd: 'azurerm_active_directory_domain_service',
  iotHub: 'azurerm_iothub',
  iotCentral: 'azurerm_iotcentral_application',
  digitalTwins: 'azurerm_digital_twins_instance',
  staticWebApp: 'azurerm_static_web_app',
  notificationHub: 'azurerm_notification_hub_namespace',
  communicationService: 'azurerm_communication_service',
  arcMachine: 'azurerm_arc_machine',
  backupCenter: 'azurerm_data_protection_backup_vault',
  mariadb: 'azurerm_mariadb_server',
  sqlElasticPool: 'azurerm_mssql_elasticpool',
  sqlVm: 'azurerm_mssql_virtual_machine',
  localNetworkGateway: 'azurerm_local_network_gateway',
  connection: 'azurerm_virtual_network_gateway_connection',
};
