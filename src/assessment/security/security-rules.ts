/**
 * Security Assessment Rules
 *
 * Evaluates Azure architectures against 25+ security best practices
 * covering network security, identity, data protection, and monitoring.
 */

import type { AssessmentFinding, SecurityAssessment } from '../types.js';
import type { WalkResult, WalkedResource } from '../../validation/types.js';

let findingId = 0;
function nextId(): string {
  return `sec-${++findingId}`;
}

/** Normalize a resource type string for comparison */
function normalizeType(type: string): string {
  return (type || '').toLowerCase().replace(/[\s_-]+/g, '').replace(/microsoft\.\w+\//g, '');
}

/** Check if a resource type matches any of the given patterns */
function isType(type: string, ...patterns: string[]): boolean {
  const normalized = normalizeType(type);
  return patterns.some(p => normalized === p.replace(/[\s_-]+/g, ''));
}

/** Check if any resource of given type(s) exists */
function hasResourceOfType(resources: WalkedResource[], ...types: string[]): boolean {
  return resources.some(r => isType(r.resource.type, ...types));
}

export function assessSecurity(walk: WalkResult): SecurityAssessment {
  findingId = 0;
  const findings: AssessmentFinding[] = [];
  const allResources = walk.resources;
  const allTypes = allResources.map(r => normalizeType(r.resource.type));

  // --- NETWORK SECURITY ---

  // 1. VMs with public IPs without NSGs
  const vms = allResources.filter(r => isType(r.resource.type, 'vm', 'virtualmachine', 'virtual machine'));
  for (const vm of vms) {
    const props = vm.resource.properties || {};
    const hasPublicIP = props.publicIp || props.publicIP || props.publicIpAddress;
    const connectedNsg = allResources.some(r =>
      isType(r.resource.type, 'nsg', 'networksecuritygroup', 'network security group') &&
      r.context.subnetName === vm.context.subnetName
    );
    if (hasPublicIP && !connectedNsg) {
      findings.push({
        id: nextId(),
        severity: 'critical',
        pillar: 'security',
        title: `VM with public IP lacks NSG: ${vm.resource.name}`,
        description: `VM "${vm.resource.name}" has a public IP address but no Network Security Group is associated with its subnet.`,
        impact: 'The VM is directly exposed to the internet without network-level access controls.',
        remediation: 'Associate an NSG with the VM\'s subnet or NIC to restrict inbound traffic.',
        autoFixPrompt: `Add a Network Security Group to the subnet containing "${vm.resource.name}"`,
      });
    }
  }

  // 2. No WAF in front of public-facing web services
  const webApps = allResources.filter(r => isType(r.resource.type,
    'appservice', 'app service', 'webapp', 'web app', 'functionapp', 'function app'));
  const hasWAF = hasResourceOfType(allResources, 'waf', 'webapplicationfirewall',
    'applicationgateway', 'app gateway', 'application gateway');
  const hasFrontDoor = hasResourceOfType(allResources, 'frontdoor', 'front door', 'azure front door');
  if (webApps.length > 0 && !hasWAF && !hasFrontDoor) {
    findings.push({
      id: nextId(),
      severity: 'critical',
      pillar: 'security',
      title: 'No WAF protecting public web services',
      description: `${webApps.length} web application(s) found but no Web Application Firewall (App Gateway WAF or Front Door WAF).`,
      impact: 'Web applications are vulnerable to OWASP Top 10 attacks (SQL injection, XSS, etc.).',
      remediation: 'Deploy an Application Gateway with WAF_v2 SKU or Azure Front Door with WAF policy.',
      autoFixPrompt: 'Add an Application Gateway with WAF_v2 in front of the web applications',
    });
  }

  // 3. PaaS services without private endpoints
  const paasServices = allResources.filter(r => isType(r.resource.type,
    'sqldatabase', 'sql database', 'sql', 'azure sql', 'cosmosdb', 'cosmos db',
    'storageaccount', 'storage account', 'storage', 'keyvault', 'key vault',
    'redis', 'rediscache', 'redis cache', 'servicebus', 'service bus',
    'eventhub', 'event hub', 'containerregistry', 'container registry', 'acr'));
  const privateEndpoints = allResources.filter(r => isType(r.resource.type,
    'privateendpoint', 'private endpoint'));
  if (paasServices.length > 0 && privateEndpoints.length === 0) {
    findings.push({
      id: nextId(),
      severity: 'critical',
      pillar: 'security',
      title: 'PaaS services without private endpoints',
      description: `${paasServices.length} PaaS service(s) found but no private endpoints. Traffic goes over the public internet.`,
      impact: 'Data traverses the public internet, increasing exposure to interception and attack.',
      remediation: 'Deploy private endpoints for all PaaS services to keep traffic on the Microsoft backbone network.',
      autoFixPrompt: 'Add private endpoints for all PaaS services (SQL, Storage, Key Vault, etc.)',
    });
  }

  // 4. No DDoS Protection on VNets
  const hasDDoS = hasResourceOfType(allResources, 'ddosprotection', 'ddos protection', 'ddos');
  const hasPublicEndpoints = allResources.some(r => {
    const props = r.resource.properties || {};
    return props.publicIp || props.publicIP || props.publicIpAddress
      || isType(r.resource.type, 'publicip', 'public ip', 'publicipaddress');
  }) || hasResourceOfType(allResources, 'applicationgateway', 'app gateway',
    'application gateway', 'loadbalancer', 'load balancer', 'frontdoor', 'front door');
  if (hasPublicEndpoints && !hasDDoS) {
    findings.push({
      id: nextId(),
      severity: 'warning',
      pillar: 'security',
      title: 'No DDoS Protection Plan',
      description: 'Public-facing resources detected but no Azure DDoS Protection Standard plan.',
      impact: 'Only basic DDoS protection (free tier) is active. May not withstand sophisticated volumetric attacks.',
      remediation: 'Enable Azure DDoS Protection Standard on VNets with public endpoints. Note: €2,944/mo base cost.',
      autoFixPrompt: 'Add Azure DDoS Protection Standard plan',
    });
  }

  // 5. Missing Key Vault for secrets
  const hasKeyVault = hasResourceOfType(allResources, 'keyvault', 'key vault');
  if (!hasKeyVault && allResources.length > 3) {
    findings.push({
      id: nextId(),
      severity: 'warning',
      pillar: 'security',
      title: 'No Key Vault for secret management',
      description: 'No Azure Key Vault found. Secrets, certificates, and encryption keys should be stored centrally.',
      impact: 'Secrets may be hardcoded in application settings or stored insecurely.',
      remediation: 'Deploy an Azure Key Vault and store all secrets, connection strings, and certificates there.',
      autoFixPrompt: 'Add an Azure Key Vault to the architecture',
    });
  }

  // 6. No Azure Monitor / Log Analytics
  const hasMonitoring = hasResourceOfType(allResources, 'loganalytics', 'log analytics',
    'loganalyticsworkspace', 'monitor', 'azure monitor', 'applicationinsights', 'application insights');
  if (!hasMonitoring && allResources.length > 3) {
    findings.push({
      id: nextId(),
      severity: 'warning',
      pillar: 'security',
      title: 'No centralized monitoring or logging',
      description: 'No Log Analytics workspace or Azure Monitor found. Security events won\'t be collected.',
      impact: 'No visibility into security threats, audit logs, or suspicious activity.',
      remediation: 'Deploy a Log Analytics workspace and enable diagnostic settings on all resources.',
      autoFixPrompt: 'Add a Log Analytics workspace for centralized monitoring',
    });
  }

  // 7. Missing NSGs on subnets
  const subnetsWithoutNsg = walk.subnets.filter(s => {
    const subnetResources = allResources.filter(r => r.context.subnetName === s.subnet.name);
    const hasNsg = subnetResources.some(r => isType(r.resource.type, 'nsg', 'networksecuritygroup', 'network security group'));
    const nsgRef = s.subnet.nsg;
    return !hasNsg && !nsgRef && (s.subnet.resources?.length || 0) > 0;
  });
  if (subnetsWithoutNsg.length > 0) {
    findings.push({
      id: nextId(),
      severity: 'warning',
      pillar: 'security',
      title: `${subnetsWithoutNsg.length} subnet(s) without NSG`,
      description: `Subnets without NSGs: ${subnetsWithoutNsg.map(s => s.subnet.name).join(', ')}`,
      impact: 'No network-level access control on these subnets. All traffic is allowed.',
      remediation: 'Associate an NSG with each subnet to control inbound and outbound traffic.',
      autoFixPrompt: `Add NSGs to subnets: ${subnetsWithoutNsg.map(s => s.subnet.name).join(', ')}`,
    });
  }

  // 8. SQL/DB without encryption configuration
  const databases = allResources.filter(r => isType(r.resource.type,
    'sqldatabase', 'sql database', 'sql', 'azure sql', 'sqlserver',
    'cosmosdb', 'cosmos db'));
  for (const db of databases) {
    const props = db.resource.properties || {};
    if (!props.encryption && !props.tde && !props.transparentDataEncryption) {
      findings.push({
        id: nextId(),
        severity: 'info',
        pillar: 'security',
        title: `Database encryption not explicitly configured: ${db.resource.name}`,
        description: `Database "${db.resource.name}" doesn't have explicit encryption configuration (TDE is enabled by default in Azure SQL).`,
        impact: 'Ensure Transparent Data Encryption (TDE) is enabled. It\'s on by default but should be verified.',
        remediation: 'Verify TDE is enabled and consider Customer Managed Keys for enhanced security.',
      });
    }
  }

  // 9. No Bastion for VM management
  const hasBastion = hasResourceOfType(allResources, 'bastion', 'azurebastion', 'azure bastion');
  if (vms.length > 0 && !hasBastion) {
    findings.push({
      id: nextId(),
      severity: 'warning',
      pillar: 'security',
      title: 'No Azure Bastion for secure VM access',
      description: `${vms.length} VM(s) found but no Azure Bastion. VMs may be accessed via direct RDP/SSH over public IPs.`,
      impact: 'Direct RDP/SSH exposes management ports to the internet, increasing attack surface.',
      remediation: 'Deploy Azure Bastion for secure, browser-based RDP/SSH access without public IP exposure.',
      autoFixPrompt: 'Add Azure Bastion for secure VM management access',
    });
  }

  // 10. Storage accounts without private endpoints
  const storageAccounts = allResources.filter(r => isType(r.resource.type,
    'storageaccount', 'storage account', 'storage'));
  if (storageAccounts.length > 0 && privateEndpoints.length === 0) {
    for (const sa of storageAccounts) {
      findings.push({
        id: nextId(),
        severity: 'warning',
        pillar: 'security',
        title: `Storage account lacks private endpoint: ${sa.resource.name}`,
        description: `Storage account "${sa.resource.name}" has no private endpoint, exposing blob/table/queue endpoints publicly.`,
        impact: 'Storage data can be accessed from the public internet if firewall rules are not properly configured.',
        remediation: 'Create a private endpoint for the storage account and disable public access.',
        autoFixPrompt: `Add a private endpoint for storage account "${sa.resource.name}"`,
      });
    }
  }

  // 11. Missing managed identity / Azure AD
  const hasManagedIdentity = allResources.some(r => {
    const props = r.resource.properties || {};
    return props.managedIdentity || props.identity || props.azureAd || props.entraId;
  });
  if (!hasManagedIdentity && allResources.length > 5) {
    findings.push({
      id: nextId(),
      severity: 'info',
      pillar: 'security',
      title: 'No managed identity configuration detected',
      description: 'No resources are configured with managed identities. Service-to-service authentication may use connection strings.',
      impact: 'Connection strings and keys are less secure than managed identity-based authentication.',
      remediation: 'Enable system-assigned or user-assigned managed identities for service-to-service authentication.',
    });
  }

  // 12. No network segmentation (everything in one subnet)
  const uniqueSubnets = new Set(walk.subnets.map(s => s.subnet.name));
  if (uniqueSubnets.size === 1 && allResources.length > 5) {
    findings.push({
      id: nextId(),
      severity: 'warning',
      pillar: 'security',
      title: 'No network segmentation — single subnet',
      description: 'All resources are in a single subnet with no network segmentation.',
      impact: 'Lateral movement is unrestricted. A compromise of one resource may lead to full network access.',
      remediation: 'Segment the network into multiple subnets (web tier, app tier, data tier) with NSGs between them.',
      autoFixPrompt: 'Split resources into separate subnets (web, app, data) with NSGs',
    });
  }

  // 13. No Azure Firewall for hub-spoke
  const hubVnets = walk.vnets.filter(v => isType(v.vnet.type, 'hubvnet', 'hub vnet'));
  const hasFirewall = hasResourceOfType(allResources, 'firewall', 'azurefirewall', 'azure firewall');
  if (hubVnets.length > 0 && !hasFirewall) {
    findings.push({
      id: nextId(),
      severity: 'warning',
      pillar: 'security',
      title: 'Hub VNet without Azure Firewall',
      description: 'Hub-spoke topology detected but no Azure Firewall in the hub for centralized network filtering.',
      impact: 'No centralized traffic inspection or network rule enforcement between spokes.',
      remediation: 'Deploy Azure Firewall in the hub VNet to inspect and filter east-west and north-south traffic.',
      autoFixPrompt: 'Add Azure Firewall to the hub VNet',
    });
  }

  // 14. VPN without encryption mentioned
  const vpnGateways = allResources.filter(r => isType(r.resource.type,
    'vpngateway', 'vpn gateway', 'virtualnetworkgateway', 'virtual network gateway'));
  for (const vpn of vpnGateways) {
    findings.push({
      id: nextId(),
      severity: 'info',
      pillar: 'security',
      title: `Verify VPN encryption: ${vpn.resource.name}`,
      description: 'Ensure VPN connections use IKEv2 with strong encryption (AES256, SHA256).',
      impact: 'Weak VPN encryption could expose data in transit between on-premises and Azure.',
      remediation: 'Configure custom IPsec/IKE policies with AES256-GCM and SHA256.',
    });
  }

  // 15. No Azure Firewall or NSGs at all
  if (!hasFirewall && subnetsWithoutNsg.length === walk.subnets.length && walk.subnets.length > 0) {
    findings.push({
      id: nextId(),
      severity: 'critical',
      pillar: 'security',
      title: 'No network security controls',
      description: 'No Azure Firewall and no NSGs found. The network has no traffic filtering.',
      impact: 'All network traffic is unrestricted — maximum attack surface.',
      remediation: 'Deploy NSGs on all subnets and consider Azure Firewall for centralized filtering.',
      autoFixPrompt: 'Add NSGs to all subnets and an Azure Firewall for centralized filtering',
    });
  }

  // 16. Public Load Balancer without WAF
  const publicLBs = allResources.filter(r => isType(r.resource.type, 'loadbalancer', 'load balancer'));
  if (publicLBs.length > 0 && !hasWAF && !hasFrontDoor) {
    findings.push({
      id: nextId(),
      severity: 'info',
      pillar: 'security',
      title: 'Load balancer without WAF layer',
      description: 'Load balancer exposes services directly. Consider adding a WAF layer for HTTP/HTTPS workloads.',
      impact: 'Web traffic reaches backend servers without web application firewall inspection.',
      remediation: 'Add Application Gateway with WAF_v2 or Azure Front Door with WAF for HTTP workloads.',
    });
  }

  // 17. Container Registry without private access
  const acr = allResources.filter(r => isType(r.resource.type,
    'containerregistry', 'container registry', 'acr'));
  for (const registry of acr) {
    if (privateEndpoints.length === 0) {
      findings.push({
        id: nextId(),
        severity: 'warning',
        pillar: 'security',
        title: `Container Registry lacks private endpoint: ${registry.resource.name}`,
        description: 'Container Registry is publicly accessible. Container images could be pulled from the internet.',
        impact: 'Potential for unauthorized image pulls and supply chain attacks.',
        remediation: 'Add a private endpoint and disable public access to the Container Registry.',
        autoFixPrompt: `Add a private endpoint for Container Registry "${registry.resource.name}"`,
      });
    }
  }

  // 18. API Management without VNet integration
  const apim = allResources.filter(r => isType(r.resource.type,
    'apimanagement', 'api management', 'apim'));
  for (const api of apim) {
    const props = api.resource.properties || {};
    if (!props.virtualNetwork && !props.vnetIntegration) {
      findings.push({
        id: nextId(),
        severity: 'info',
        pillar: 'security',
        title: `API Management without VNet integration: ${api.resource.name}`,
        description: 'APIM is not integrated with a VNet, exposing the management plane publicly.',
        impact: 'API management endpoints accessible from the internet.',
        remediation: 'Deploy APIM in internal or external VNet mode for network isolation.',
      });
    }
  }

  // 19. Missing service endpoints or private endpoints for SQL
  for (const db of databases) {
    if (isType(db.resource.type, 'sqldatabase', 'sql database', 'sql', 'azure sql', 'sqlserver')) {
      if (privateEndpoints.length === 0) {
        findings.push({
          id: nextId(),
          severity: 'warning',
          pillar: 'security',
          title: `SQL Database lacks private endpoint: ${db.resource.name}`,
          description: 'SQL Database is potentially accessible from the public internet.',
          impact: 'SQL Server is a high-value target. Public access increases risk of brute-force attacks.',
          remediation: 'Add a private endpoint for the SQL Server and disable public access.',
          autoFixPrompt: `Add a private endpoint for SQL Database "${db.resource.name}"`,
        });
      }
    }
  }

  // 20. No Microsoft Defender for Cloud
  const hasDefender = hasResourceOfType(allResources, 'defender', 'microsoft defender',
    'security center', 'securitycenter');
  if (!hasDefender && allResources.length > 5) {
    findings.push({
      id: nextId(),
      severity: 'info',
      pillar: 'security',
      title: 'No Microsoft Defender for Cloud',
      description: 'Consider enabling Microsoft Defender for Cloud for continuous security assessment and threat detection.',
      impact: 'Missing real-time threat detection and security posture management.',
      remediation: 'Enable Microsoft Defender for Cloud enhanced security features.',
    });
  }

  // 21. AKS without network policy
  const aksClusters = allResources.filter(r => isType(r.resource.type,
    'aks', 'kubernetes', 'azure kubernetes service'));
  for (const aks of aksClusters) {
    const props = aks.resource.properties || {};
    if (!props.networkPolicy) {
      findings.push({
        id: nextId(),
        severity: 'warning',
        pillar: 'security',
        title: `AKS without network policy: ${aks.resource.name}`,
        description: 'AKS cluster has no network policy configured (Calico or Azure). All pods can communicate freely.',
        impact: 'No micro-segmentation within the cluster. Compromised pods can reach all other pods.',
        remediation: 'Enable Azure or Calico network policy on the AKS cluster.',
      });
    }
  }

  // 22. Functions without VNet integration
  const functions = allResources.filter(r => isType(r.resource.type,
    'functionapp', 'function app', 'functions', 'azure functions'));
  for (const fn of functions) {
    const inSubnet = fn.context.subnetName;
    if (!inSubnet) {
      findings.push({
        id: nextId(),
        severity: 'info',
        pillar: 'security',
        title: `Function App not VNet-integrated: ${fn.resource.name}`,
        description: 'Function App is not in a VNet. Outbound traffic uses shared IPs.',
        impact: 'Cannot access private resources or use private endpoints for outbound connections.',
        remediation: 'Enable VNet integration on the Function App for secure outbound connectivity.',
      });
    }
  }

  // 23. App Service without VNet integration
  for (const app of webApps) {
    const inSubnet = app.context.subnetName;
    if (!inSubnet && isType(app.resource.type, 'appservice', 'app service', 'webapp', 'web app')) {
      findings.push({
        id: nextId(),
        severity: 'info',
        pillar: 'security',
        title: `App Service not VNet-integrated: ${app.resource.name}`,
        description: 'App Service is not integrated with a VNet. Backend connections go over the public internet.',
        impact: 'Cannot securely access private databases, storage, or other backend services.',
        remediation: 'Enable VNet integration on the App Service plan.',
      });
    }
  }

  // 24. No encryption in transit checks
  const hasCosmosDB = allResources.filter(r => isType(r.resource.type, 'cosmosdb', 'cosmos db', 'cosmos'));
  for (const cosmos of hasCosmosDB) {
    findings.push({
      id: nextId(),
      severity: 'info',
      pillar: 'security',
      title: `Verify Cosmos DB firewall rules: ${cosmos.resource.name}`,
      description: 'Ensure Cosmos DB firewall is configured to allow only required VNet/IP ranges.',
      impact: 'Open firewall rules could expose the database to unauthorized access.',
      remediation: 'Configure Cosmos DB firewall to restrict access and enable private endpoint.',
    });
  }

  // 25. Multiple regions without consistent security
  const regions = new Set(allResources.map(r => r.context.regionName).filter(Boolean));
  if (regions.size > 1) {
    findings.push({
      id: nextId(),
      severity: 'info',
      pillar: 'security',
      title: 'Multi-region deployment — verify consistent security',
      description: `Architecture spans ${regions.size} regions. Ensure security controls (NSGs, Firewall, WAF) are consistent across all regions.`,
      impact: 'Inconsistent security controls between regions may create blind spots.',
      remediation: 'Use Azure Policy to enforce consistent security baselines across all regions.',
    });
  }

  // 26. Redis cache without VNet
  const redisCaches = allResources.filter(r => isType(r.resource.type,
    'redis', 'rediscache', 'redis cache', 'azure cache for redis'));
  for (const redis of redisCaches) {
    if (!redis.context.subnetName && privateEndpoints.length === 0) {
      findings.push({
        id: nextId(),
        severity: 'warning',
        pillar: 'security',
        title: `Redis Cache lacks network isolation: ${redis.resource.name}`,
        description: 'Redis Cache is accessible over the public internet without VNet integration or private endpoint.',
        impact: 'Cache data could be intercepted or accessed by unauthorized parties.',
        remediation: 'Deploy Redis in a VNet or add a private endpoint, and enable SSL enforcement.',
        autoFixPrompt: `Add a private endpoint for Redis Cache "${redis.resource.name}"`,
      });
    }
  }

  // Score: 5 = secure, 1 = major issues
  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const warningCount = findings.filter(f => f.severity === 'warning').length;
  let score = 5;
  score -= criticalCount * 1.5;
  score -= warningCount * 0.5;
  score = Math.max(1, Math.min(5, Math.round(score)));

  return { score, findings };
}
