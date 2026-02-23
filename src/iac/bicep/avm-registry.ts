/**
 * AVM Bicep Module Registry
 *
 * Maps architecture resource type keys to Azure Verified Module (AVM) Bicep
 * module references.  When a module is not available the generator falls back
 * to a raw `resource` declaration.
 *
 * Module versions are pinned to recent stable releases from
 * https://azure.github.io/Azure-Verified-Modules/
 */

import type { AvmBicepModuleRef } from '../types.js';

export const AVM_BICEP_MODULES: Record<string, AvmBicepModuleRef> = {
  // ==================== NETWORKING ====================
  vnet: {
    module: 'br/public:avm/res/network/virtual-network:0.5.2',
    requiredParams: ['name', 'location'],
    optionalParams: ['addressPrefixes', 'subnets', 'tags', 'lock', 'roleAssignments', 'diagnosticSettings'],
    armResourceType: 'Microsoft.Network/virtualNetworks',
  },
  hubVnet: {
    module: 'br/public:avm/res/network/virtual-network:0.5.2',
    requiredParams: ['name', 'location'],
    optionalParams: ['addressPrefixes', 'subnets', 'tags', 'lock', 'roleAssignments', 'diagnosticSettings'],
    armResourceType: 'Microsoft.Network/virtualNetworks',
  },
  nsg: {
    module: 'br/public:avm/res/network/network-security-group:0.5.0',
    requiredParams: ['name', 'location'],
    optionalParams: ['securityRules', 'tags', 'lock', 'roleAssignments', 'diagnosticSettings'],
    armResourceType: 'Microsoft.Network/networkSecurityGroups',
  },
  loadBalancer: {
    module: 'br/public:avm/res/network/load-balancer:0.4.0',
    requiredParams: ['name', 'location', 'frontendIPConfigurations'],
    optionalParams: ['backendAddressPools', 'loadBalancingRules', 'probes', 'tags'],
    armResourceType: 'Microsoft.Network/loadBalancers',
  },
  appGateway: {
    module: 'br/public:avm/res/network/application-gateway:0.6.0',
    requiredParams: ['name', 'location'],
    optionalParams: ['sku', 'gatewayIPConfigurations', 'frontendIPConfigurations', 'backendAddressPools', 'tags'],
    armResourceType: 'Microsoft.Network/applicationGateways',
  },
  firewall: {
    module: 'br/public:avm/res/network/azure-firewall:0.5.0',
    requiredParams: ['name', 'location'],
    optionalParams: ['azureSkuTier', 'firewallPolicyId', 'virtualNetworkResourceId', 'publicIPAddressObject', 'tags'],
    armResourceType: 'Microsoft.Network/azureFirewalls',
  },
  bastion: {
    module: 'br/public:avm/res/network/bastion-host:0.4.0',
    requiredParams: ['name', 'location', 'virtualNetworkResourceId'],
    optionalParams: ['skuName', 'tags', 'lock', 'diagnosticSettings'],
    armResourceType: 'Microsoft.Network/bastionHosts',
  },
  vpnGateway: {
    module: 'br/public:avm/res/network/virtual-network-gateway:0.5.0',
    requiredParams: ['name', 'location', 'gatewayType', 'skuName'],
    optionalParams: ['vpnType', 'subnetResourceId', 'tags'],
    armResourceType: 'Microsoft.Network/virtualNetworkGateways',
  },
  publicIp: {
    module: 'br/public:avm/res/network/public-ip-address:0.6.0',
    requiredParams: ['name', 'location'],
    optionalParams: ['skuName', 'publicIPAllocationMethod', 'zones', 'tags'],
    armResourceType: 'Microsoft.Network/publicIPAddresses',
  },
  privateEndpoint: {
    module: 'br/public:avm/res/network/private-endpoint:0.9.0',
    requiredParams: ['name', 'location', 'subnetResourceId'],
    optionalParams: ['privateLinkServiceConnections', 'tags', 'lock'],
    armResourceType: 'Microsoft.Network/privateEndpoints',
  },
  dns: {
    module: 'br/public:avm/res/network/dns-zone:0.5.0',
    requiredParams: ['name'],
    optionalParams: ['tags', 'lock', 'roleAssignments'],
    armResourceType: 'Microsoft.Network/dnsZones',
  },
  privateDns: {
    module: 'br/public:avm/res/network/private-dns-zone:0.6.0',
    requiredParams: ['name'],
    optionalParams: ['virtualNetworkLinks', 'tags', 'lock'],
    armResourceType: 'Microsoft.Network/privateDnsZones',
  },
  frontDoor: {
    module: 'br/public:avm/res/cdn/profile:0.7.0',
    requiredParams: ['name', 'location'],
    optionalParams: ['sku', 'originGroups', 'afdEndpoints', 'tags'],
    armResourceType: 'Microsoft.Cdn/profiles',
  },
  nat: {
    module: 'br/public:avm/res/network/nat-gateway:1.2.0',
    requiredParams: ['name', 'location'],
    optionalParams: ['zones', 'publicIpAddressObjects', 'tags'],
    armResourceType: 'Microsoft.Network/natGateways',
  },
  routeTable: {
    module: 'br/public:avm/res/network/route-table:0.4.0',
    requiredParams: ['name', 'location'],
    optionalParams: ['routes', 'tags'],
    armResourceType: 'Microsoft.Network/routeTables',
  },
  trafficManager: {
    module: 'br/public:avm/res/network/traffic-manager-profile:0.3.0',
    requiredParams: ['name'],
    optionalParams: ['trafficRoutingMethod', 'endpoints', 'tags'],
    armResourceType: 'Microsoft.Network/trafficManagerProfiles',
  },

  // ==================== COMPUTE ====================
  vm: {
    module: 'br/public:avm/res/compute/virtual-machine:0.9.0',
    requiredParams: ['name', 'location', 'zone', 'imageReference', 'osDisk', 'osType', 'adminCredential', 'nicConfigurations'],
    optionalParams: ['vmSize', 'tags', 'lock', 'diagnosticSettings', 'encryptionAtHost'],
    armResourceType: 'Microsoft.Compute/virtualMachines',
  },
  vmss: {
    module: 'br/public:avm/res/compute/virtual-machine-scale-set:0.4.0',
    requiredParams: ['name', 'location', 'imageReference', 'osDisk', 'osType', 'adminCredential', 'nicConfigurations'],
    optionalParams: ['skuName', 'skuCapacity', 'tags'],
    armResourceType: 'Microsoft.Compute/virtualMachineScaleSets',
  },
  aks: {
    module: 'br/public:avm/res/container-service/managed-cluster:0.5.0',
    requiredParams: ['name', 'location', 'primaryAgentPoolProfiles'],
    optionalParams: ['kubernetesVersion', 'networkPlugin', 'tags', 'lock', 'diagnosticSettings'],
    armResourceType: 'Microsoft.ContainerService/managedClusters',
  },
  containerRegistry: {
    module: 'br/public:avm/res/container-registry/registry:0.6.0',
    requiredParams: ['name', 'location'],
    optionalParams: ['acrSku', 'adminUserEnabled', 'tags', 'lock'],
    armResourceType: 'Microsoft.ContainerRegistry/registries',
  },
  containerApp: {
    module: 'br/public:avm/res/app/container-app:0.11.0',
    requiredParams: ['name', 'location', 'environmentResourceId'],
    optionalParams: ['containers', 'tags'],
    armResourceType: 'Microsoft.App/containerApps',
  },
  containerAppEnv: {
    module: 'br/public:avm/res/app/managed-environment:0.8.0',
    requiredParams: ['name', 'location', 'logAnalyticsWorkspaceResourceId'],
    optionalParams: ['tags', 'lock'],
    armResourceType: 'Microsoft.App/managedEnvironments',
  },
  appService: {
    module: 'br/public:avm/res/web/site:0.12.0',
    requiredParams: ['name', 'location', 'kind', 'serverFarmResourceId'],
    optionalParams: ['siteConfig', 'httpsOnly', 'tags'],
    armResourceType: 'Microsoft.Web/sites',
  },
  functionApp: {
    module: 'br/public:avm/res/web/site:0.12.0',
    requiredParams: ['name', 'location', 'kind', 'serverFarmResourceId'],
    optionalParams: ['siteConfig', 'tags'],
    armResourceType: 'Microsoft.Web/sites',
  },
  appServicePlan: {
    module: 'br/public:avm/res/web/serverfarm:0.4.0',
    requiredParams: ['name', 'location'],
    optionalParams: ['sku', 'tags', 'lock'],
    armResourceType: 'Microsoft.Web/serverfarms',
  },
  disk: {
    module: 'br/public:avm/res/compute/disk:0.4.0',
    requiredParams: ['name', 'location', 'sku'],
    optionalParams: ['diskSizeGB', 'tags'],
    armResourceType: 'Microsoft.Compute/disks',
  },

  // ==================== STORAGE ====================
  storageAccount: {
    module: 'br/public:avm/res/storage/storage-account:0.14.0',
    requiredParams: ['name', 'location'],
    optionalParams: ['skuName', 'kind', 'tags', 'lock', 'privateEndpoints', 'networkAcls', 'blobServices'],
    armResourceType: 'Microsoft.Storage/storageAccounts',
  },

  // ==================== DATABASES ====================
  cosmosDb: {
    module: 'br/public:avm/res/document-db/database-account:0.9.0',
    requiredParams: ['name', 'location'],
    optionalParams: ['databaseAccountOfferType', 'locations', 'sqlDatabases', 'tags'],
    armResourceType: 'Microsoft.DocumentDB/databaseAccounts',
  },
  sqlServer: {
    module: 'br/public:avm/res/sql/server:0.10.0',
    requiredParams: ['name', 'location'],
    optionalParams: ['administratorLogin', 'administratorLoginPassword', 'databases', 'tags'],
    armResourceType: 'Microsoft.Sql/servers',
  },
  sqlDatabase: {
    module: 'br/public:avm/res/sql/server:0.10.0',
    requiredParams: ['name', 'location'],
    optionalParams: ['sku', 'tags'],
    armResourceType: 'Microsoft.Sql/servers/databases',
  },
  postgresql: {
    module: 'br/public:avm/res/db-for-postgre-sql/flexible-server:0.4.0',
    requiredParams: ['name', 'location', 'skuName', 'tier'],
    optionalParams: ['version', 'storageSizeGB', 'tags'],
    armResourceType: 'Microsoft.DBforPostgreSQL/flexibleServers',
  },
  postgresqlFlex: {
    module: 'br/public:avm/res/db-for-postgre-sql/flexible-server:0.4.0',
    requiredParams: ['name', 'location', 'skuName', 'tier'],
    optionalParams: ['version', 'storageSizeGB', 'tags'],
    armResourceType: 'Microsoft.DBforPostgreSQL/flexibleServers',
  },
  mysql: {
    module: 'br/public:avm/res/db-for-my-sql/flexible-server:0.5.0',
    requiredParams: ['name', 'location', 'skuName', 'tier'],
    optionalParams: ['version', 'storageSizeGB', 'tags'],
    armResourceType: 'Microsoft.DBforMySQL/flexibleServers',
  },
  redis: {
    module: 'br/public:avm/res/cache/redis:0.7.0',
    requiredParams: ['name', 'location'],
    optionalParams: ['skuName', 'capacity', 'tags', 'lock'],
    armResourceType: 'Microsoft.Cache/redis',
  },

  // ==================== SECURITY ====================
  keyVault: {
    module: 'br/public:avm/res/key-vault/vault:0.10.0',
    requiredParams: ['name', 'location'],
    optionalParams: ['sku', 'enableRbacAuthorization', 'accessPolicies', 'tags', 'lock', 'privateEndpoints'],
    armResourceType: 'Microsoft.KeyVault/vaults',
  },

  // ==================== INTEGRATION ====================
  apiManagement: {
    module: 'br/public:avm/res/api-management/service:0.8.0',
    requiredParams: ['name', 'location', 'publisherEmail', 'publisherName'],
    optionalParams: ['sku', 'tags', 'lock'],
    armResourceType: 'Microsoft.ApiManagement/service',
  },
  serviceBus: {
    module: 'br/public:avm/res/service-bus/namespace:0.10.0',
    requiredParams: ['name', 'location'],
    optionalParams: ['skuObject', 'queues', 'topics', 'tags', 'lock'],
    armResourceType: 'Microsoft.ServiceBus/namespaces',
  },
  eventHub: {
    module: 'br/public:avm/res/event-hub/namespace:0.7.0',
    requiredParams: ['name', 'location'],
    optionalParams: ['skuName', 'eventhubs', 'tags', 'lock'],
    armResourceType: 'Microsoft.EventHub/namespaces',
  },
  eventGrid: {
    module: 'br/public:avm/res/event-grid/topic:0.4.0',
    requiredParams: ['name', 'location'],
    optionalParams: ['tags'],
    armResourceType: 'Microsoft.EventGrid/topics',
  },
  logicApp: {
    module: 'br/public:avm/res/logic/workflow:0.4.0',
    requiredParams: ['name', 'location'],
    optionalParams: ['definition', 'tags'],
    armResourceType: 'Microsoft.Logic/workflows',
  },
  appConfig: {
    module: 'br/public:avm/res/app-configuration/configuration-store:0.6.0',
    requiredParams: ['name', 'location'],
    optionalParams: ['sku', 'tags', 'lock'],
    armResourceType: 'Microsoft.AppConfiguration/configurationStores',
  },
  signalR: {
    module: 'br/public:avm/res/signal-r-service/signal-r:0.4.0',
    requiredParams: ['name', 'location'],
    optionalParams: ['sku', 'tags'],
    armResourceType: 'Microsoft.SignalRService/signalR',
  },

  // ==================== AI / ML ====================
  openAI: {
    module: 'br/public:avm/res/cognitive-services/account:0.9.0',
    requiredParams: ['name', 'location', 'kind'],
    optionalParams: ['sku', 'deployments', 'tags', 'lock'],
    armResourceType: 'Microsoft.CognitiveServices/accounts',
  },
  cognitiveServices: {
    module: 'br/public:avm/res/cognitive-services/account:0.9.0',
    requiredParams: ['name', 'location', 'kind'],
    optionalParams: ['sku', 'tags'],
    armResourceType: 'Microsoft.CognitiveServices/accounts',
  },
  aiSearch: {
    module: 'br/public:avm/res/search/search-service:0.7.0',
    requiredParams: ['name', 'location'],
    optionalParams: ['sku', 'replicaCount', 'partitionCount', 'tags'],
    armResourceType: 'Microsoft.Search/searchServices',
  },
  machineLearning: {
    module: 'br/public:avm/res/machine-learning-services/workspace:0.9.0',
    requiredParams: ['name', 'location'],
    optionalParams: ['sku', 'associatedStorageAccountResourceId', 'associatedKeyVaultResourceId', 'tags'],
    armResourceType: 'Microsoft.MachineLearningServices/workspaces',
  },

  // ==================== ANALYTICS ====================
  databricks: {
    module: 'br/public:avm/res/databricks/workspace:0.8.0',
    requiredParams: ['name', 'location'],
    optionalParams: ['managedResourceGroupResourceId', 'sku', 'tags'],
    armResourceType: 'Microsoft.Databricks/workspaces',
  },
  dataFactory: {
    module: 'br/public:avm/res/data-factory/factory:0.7.0',
    requiredParams: ['name', 'location'],
    optionalParams: ['tags', 'lock'],
    armResourceType: 'Microsoft.DataFactory/factories',
  },

  // ==================== MONITORING ====================
  logAnalytics: {
    module: 'br/public:avm/res/operational-insights/workspace:0.9.0',
    requiredParams: ['name', 'location'],
    optionalParams: ['skuName', 'dataRetention', 'tags', 'lock'],
    armResourceType: 'Microsoft.OperationalInsights/workspaces',
  },
  appInsights: {
    module: 'br/public:avm/res/insights/component:0.4.0',
    requiredParams: ['name', 'location', 'workspaceResourceId'],
    optionalParams: ['kind', 'applicationType', 'tags'],
    armResourceType: 'Microsoft.Insights/components',
  },

  // ==================== MANAGEMENT ====================
  recoveryVault: {
    module: 'br/public:avm/res/recovery-services/vault:0.5.0',
    requiredParams: ['name', 'location'],
    optionalParams: ['sku', 'tags', 'lock'],
    armResourceType: 'Microsoft.RecoveryServices/vaults',
  },
  automationAccount: {
    module: 'br/public:avm/res/automation/automation-account:0.11.0',
    requiredParams: ['name', 'location'],
    optionalParams: ['sku', 'tags', 'lock'],
    armResourceType: 'Microsoft.Automation/automationAccounts',
  },
  managedIdentity: {
    module: 'br/public:avm/res/managed-identity/user-assigned-identity:0.4.0',
    requiredParams: ['name', 'location'],
    optionalParams: ['tags', 'lock'],
    armResourceType: 'Microsoft.ManagedIdentity/userAssignedIdentities',
  },
};

/** Resource types that have an AVM Bicep module */
export function hasAvmBicepModule(resourceType: string): boolean {
  return resourceType in AVM_BICEP_MODULES;
}

/** Get the AVM Bicep module reference for a resource type, or undefined */
export function getAvmBicepModule(resourceType: string): AvmBicepModuleRef | undefined {
  return AVM_BICEP_MODULES[resourceType];
}

/**
 * Fallback ARM API versions for raw resource declarations when no AVM module
 * is available.
 */
export const ARM_API_VERSIONS: Record<string, string> = {
  'Microsoft.Network/virtualNetworks/subnets': '2024-01-01',
  'Microsoft.Network/applicationSecurityGroups': '2024-01-01',
  'Microsoft.Network/firewallPolicies': '2024-01-01',
  'Microsoft.Network/virtualWans': '2024-01-01',
  'Microsoft.Network/virtualHubs': '2024-01-01',
  'Microsoft.Network/expressRouteCircuits': '2024-01-01',
  'Microsoft.Network/connections': '2024-01-01',
  'Microsoft.Network/ddosProtectionPlans': '2024-01-01',
  'Microsoft.Network/privateLinkServices': '2024-01-01',
  'Microsoft.Network/networkWatchers': '2024-01-01',
  'Microsoft.Network/networkManagers': '2024-01-01',
  'Microsoft.Cdn/profiles': '2024-02-01',
  'Microsoft.Compute/availabilitySets': '2024-03-01',
  'Microsoft.ContainerInstance/containerGroups': '2024-05-01-preview',
  'Microsoft.Web/staticSites': '2023-12-01',
  'Microsoft.ServiceFabric/clusters': '2023-11-01-preview',
  'Microsoft.Batch/batchAccounts': '2024-02-01',
  'Microsoft.DesktopVirtualization/hostPools': '2024-04-03',
  'Microsoft.DataLakeStore/accounts': '2016-11-01',
  'Microsoft.NetApp/netAppAccounts': '2024-03-01',
  'Microsoft.Sql/managedInstances': '2023-05-01-preview',
  'Microsoft.Kusto/clusters': '2024-04-13',
  'Microsoft.Purview/accounts': '2021-12-01',
  'Microsoft.Synapse/workspaces': '2021-06-01',
  'Microsoft.StreamAnalytics/streamingJobs': '2021-10-01-preview',
  'Microsoft.HDInsight/clusters': '2024-08-01-preview',
  'Microsoft.Devices/IotHubs': '2023-06-30',
  'Microsoft.IoTCentral/iotApps': '2024-11-01',
  'Microsoft.DigitalTwins/digitalTwinsInstances': '2023-01-31',
  'Microsoft.BotService/botServices': '2022-09-15',
  'Microsoft.Communication/communicationServices': '2023-04-01',
  'Microsoft.NotificationHubs/namespaces': '2023-10-01',
  'Microsoft.SecurityInsights/alertRules': '2024-03-01',
  'Microsoft.Security/pricings': '2024-01-01',
  'Microsoft.AAD/domainServices': '2022-12-01',
  'Microsoft.Relay/namespaces': '2024-01-01',
  'Microsoft.Logic/integrationAccounts': '2019-05-01',
  'Microsoft.DataMigration/services': '2022-03-30-preview',
  'Microsoft.AnalysisServices/servers': '2017-08-01',
  'Microsoft.PowerBIDedicated/capacities': '2021-01-01',
  'Microsoft.Fabric/capacities': '2023-11-01',
  'Microsoft.Monitor/accounts': '2023-04-03',
  'Microsoft.Insights/actionGroups': '2023-09-01-preview',
  'Microsoft.Dashboard/grafana': '2023-09-01',
  'Microsoft.HybridCompute/machines': '2024-07-10',
  'Microsoft.Authorization/policyDefinitions': '2023-04-01',
  'Microsoft.Advisor/recommendations': '2023-01-01',
  'Microsoft.DataProtection/backupVaults': '2024-04-01',
  'Microsoft.Migrate/migrateProjects': '2020-06-01-preview',
  'Microsoft.DBforMariaDB/servers': '2018-06-01',
  'Microsoft.Sql/servers/elasticPools': '2023-05-01-preview',
  'Microsoft.SqlVirtualMachine/sqlVirtualMachines': '2023-10-01',
  'Microsoft.DevOps/pipelines': '2020-07-13-preview',
};
