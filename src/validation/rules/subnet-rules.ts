/**
 * Subnet Validation Rules
 *
 * Validates Azure subnet naming conventions, sizing requirements,
 * and CIDR validity based on real Azure constraints.
 */

import type { ValidationFinding, WalkResult } from '../types.js';

/** Parse a CIDR prefix length, e.g. "10.0.0.0/24" → 24 */
function parseCIDRPrefix(cidr?: string): number | null {
  if (!cidr) return null;
  const match = cidr.match(/\/(\d+)$/);
  if (!match) return null;
  const prefix = parseInt(match[1], 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return null;
  return prefix;
}

/** Check if a string looks like valid CIDR notation */
function isValidCIDR(cidr?: string): boolean {
  if (!cidr) return false;
  const match = cidr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/);
  if (!match) return false;
  const octets = [parseInt(match[1]), parseInt(match[2]), parseInt(match[3]), parseInt(match[4])];
  if (octets.some(o => o > 255)) return false;
  const prefix = parseInt(match[5]);
  return prefix >= 0 && prefix <= 32;
}

/** Normalise resource type to lowercase for comparison */
function normaliseType(type: string): string {
  return (type || '').toLowerCase().replace(/[\s_-]/g, '');
}

/** Check if a resource type matches a target (fuzzy) */
function isType(type: string, ...targets: string[]): boolean {
  const n = normaliseType(type);
  return targets.some(t => {
    const nt = normaliseType(t);
    return n === nt || n.includes(nt) || n.endsWith(nt);
  });
}

let ruleCounter = 0;
function nextId(): string {
  return `subnet-${++ruleCounter}`;
}

export function subnetRules(walk: WalkResult): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  ruleCounter = 0;

  for (const { subnet, vnetName, context } of walk.subnets) {
    const subnetResources = subnet.resources ?? [];
    const subnetTypes = subnetResources.map(r => normaliseType(r.type));

    // ── Rule 1: Azure Firewall must be in "AzureFirewallSubnet" ──
    const hasFirewall = subnetTypes.some(t =>
      t.includes('firewall') && !t.includes('policy') && !t.includes('waf')
    );
    if (hasFirewall && subnet.name !== 'AzureFirewallSubnet') {
      findings.push({
        id: nextId(),
        severity: 'error',
        category: 'naming',
        resourceId: subnet.id || subnet.name,
        resourceName: subnet.name,
        title: 'Azure Firewall requires subnet named "AzureFirewallSubnet"',
        description: `Subnet "${subnet.name}" in VNet "${vnetName}" contains an Azure Firewall but is not named "AzureFirewallSubnet". Azure requires this exact name.`,
        sourceUrl: 'https://learn.microsoft.com/en-us/azure/firewall/tutorial-firewall-deploy-portal#set-up-the-network',
        autoFixPrompt: `Rename the subnet containing Azure Firewall in VNet "${vnetName}" to "AzureFirewallSubnet".`,
      });
    }

    // ── Rule 2: AzureFirewallSubnet minimum /26 ──
    if (hasFirewall || subnet.name === 'AzureFirewallSubnet') {
      const prefix = parseCIDRPrefix(subnet.addressPrefix);
      if (prefix !== null && prefix > 26) {
        findings.push({
          id: nextId(),
          severity: 'error',
          category: 'sizing',
          resourceId: subnet.id || subnet.name,
          resourceName: subnet.name,
          title: 'AzureFirewallSubnet must be at least /26',
          description: `Subnet "${subnet.name}" has prefix /${prefix} but Azure Firewall requires at least /26 (64 addresses).`,
          sourceUrl: 'https://learn.microsoft.com/en-us/azure/firewall/firewall-faq#why-does-azure-firewall-need-a--26-subnet-size',
          autoFixPrompt: `Change the address prefix of subnet "${subnet.name}" in VNet "${vnetName}" to at least /26.`,
        });
      }
    }

    // ── Rule 3: Bastion must be in "AzureBastionSubnet" ──
    const hasBastion = subnetTypes.some(t => t.includes('bastion'));
    if (hasBastion && subnet.name !== 'AzureBastionSubnet') {
      findings.push({
        id: nextId(),
        severity: 'error',
        category: 'naming',
        resourceId: subnet.id || subnet.name,
        resourceName: subnet.name,
        title: 'Azure Bastion requires subnet named "AzureBastionSubnet"',
        description: `Subnet "${subnet.name}" in VNet "${vnetName}" contains a Bastion host but is not named "AzureBastionSubnet". Azure requires this exact name.`,
        sourceUrl: 'https://learn.microsoft.com/en-us/azure/bastion/configuration-settings#subnet',
        autoFixPrompt: `Rename the subnet containing Azure Bastion in VNet "${vnetName}" to "AzureBastionSubnet".`,
      });
    }

    // ── Rule 4: AzureBastionSubnet minimum /26 ──
    if (hasBastion || subnet.name === 'AzureBastionSubnet') {
      const prefix = parseCIDRPrefix(subnet.addressPrefix);
      if (prefix !== null && prefix > 26) {
        findings.push({
          id: nextId(),
          severity: 'error',
          category: 'sizing',
          resourceId: subnet.id || subnet.name,
          resourceName: subnet.name,
          title: 'AzureBastionSubnet must be at least /26',
          description: `Subnet "${subnet.name}" has prefix /${prefix} but Azure Bastion requires at least /26 (64 addresses).`,
          sourceUrl: 'https://learn.microsoft.com/en-us/azure/bastion/configuration-settings#subnet',
          autoFixPrompt: `Change the address prefix of subnet "${subnet.name}" in VNet "${vnetName}" to at least /26.`,
        });
      }
    }

    // ── Rule 5: VPN Gateway must be in "GatewaySubnet" ──
    const hasVPNGW = subnetTypes.some(t =>
      t.includes('vpngateway') || t.includes('virtualnetworkgateway') || t === 'vpngw'
    );
    if (hasVPNGW && subnet.name !== 'GatewaySubnet') {
      findings.push({
        id: nextId(),
        severity: 'error',
        category: 'naming',
        resourceId: subnet.id || subnet.name,
        resourceName: subnet.name,
        title: 'VPN/ExpressRoute Gateway requires subnet named "GatewaySubnet"',
        description: `Subnet "${subnet.name}" in VNet "${vnetName}" contains a VPN Gateway but is not named "GatewaySubnet". Azure requires this exact name.`,
        sourceUrl: 'https://learn.microsoft.com/en-us/azure/vpn-gateway/vpn-gateway-about-vpn-gateway-settings#gwsub',
        autoFixPrompt: `Rename the subnet containing the VPN Gateway in VNet "${vnetName}" to "GatewaySubnet".`,
      });
    }

    // ── Rule 6: GatewaySubnet minimum /27 recommended ──
    if (subnet.name === 'GatewaySubnet') {
      const prefix = parseCIDRPrefix(subnet.addressPrefix);
      if (prefix !== null && prefix > 27) {
        findings.push({
          id: nextId(),
          severity: 'warning',
          category: 'sizing',
          resourceId: subnet.id || subnet.name,
          resourceName: subnet.name,
          title: 'GatewaySubnet should be at least /27',
          description: `GatewaySubnet has prefix /${prefix}. Microsoft recommends at least /27 for VPN/ExpressRoute gateways. A /28 works but is very tight.`,
          sourceUrl: 'https://learn.microsoft.com/en-us/azure/vpn-gateway/vpn-gateway-about-vpn-gateway-settings#gwsub',
          autoFixPrompt: `Change the GatewaySubnet address prefix in VNet "${vnetName}" to at least /27.`,
        });
      }
    }

    // ── Rule 7: Application Gateway needs dedicated subnet ──
    const hasAppGW = subnetTypes.some(t =>
      t.includes('applicationgateway') || t.includes('appgateway') || t === 'appgw' || t === 'agw'
    );
    if (hasAppGW) {
      const otherResourceCount = subnetResources.filter(r => {
        const nt = normaliseType(r.type);
        return !nt.includes('applicationgateway') && !nt.includes('appgateway')
          && nt !== 'appgw' && nt !== 'agw';
      }).length;
      if (otherResourceCount > 0) {
        findings.push({
          id: nextId(),
          severity: 'warning',
          category: 'placement',
          resourceId: subnet.id || subnet.name,
          resourceName: subnet.name,
          title: 'Application Gateway should have a dedicated subnet',
          description: `Subnet "${subnet.name}" contains an Application Gateway along with ${otherResourceCount} other resource(s). Application Gateway should be in its own dedicated subnet.`,
          sourceUrl: 'https://learn.microsoft.com/en-us/azure/application-gateway/configuration-infrastructure#virtual-network-and-dedicated-subnet',
          autoFixPrompt: `Move the Application Gateway in VNet "${vnetName}" to its own dedicated subnet named "AppGatewaySubnet".`,
        });
      }
    }

    // ── Rule 8: Application Gateway subnet minimum /26 recommended ──
    if (hasAppGW) {
      const prefix = parseCIDRPrefix(subnet.addressPrefix);
      if (prefix !== null && prefix > 26) {
        findings.push({
          id: nextId(),
          severity: 'warning',
          category: 'sizing',
          resourceId: subnet.id || subnet.name,
          resourceName: subnet.name,
          title: 'Application Gateway subnet should be at least /26',
          description: `Subnet "${subnet.name}" has prefix /${prefix}. Microsoft recommends at least /26 for Application Gateway to support scaling.`,
          sourceUrl: 'https://learn.microsoft.com/en-us/azure/application-gateway/configuration-infrastructure#size-of-the-subnet',
          autoFixPrompt: `Change the Application Gateway subnet "${subnet.name}" in VNet "${vnetName}" to at least /26.`,
        });
      }
    }

    // ── Rule 9: Subnet address prefix must be valid CIDR ──
    if (subnet.addressPrefix && !isValidCIDR(subnet.addressPrefix)) {
      findings.push({
        id: nextId(),
        severity: 'error',
        category: 'subnet',
        resourceId: subnet.id || subnet.name,
        resourceName: subnet.name,
        title: 'Invalid subnet CIDR notation',
        description: `Subnet "${subnet.name}" has address prefix "${subnet.addressPrefix}" which is not valid CIDR notation. Expected format: x.x.x.x/y`,
        autoFixPrompt: `Fix the address prefix for subnet "${subnet.name}" in VNet "${vnetName}" to use valid CIDR notation (e.g., 10.0.1.0/24).`,
      });
    }

    // ── Rule 10: Subnet prefix too small (/30, /31, /32) ──
    if (subnet.addressPrefix) {
      const prefix = parseCIDRPrefix(subnet.addressPrefix);
      if (prefix !== null && prefix >= 30) {
        findings.push({
          id: nextId(),
          severity: 'warning',
          category: 'sizing',
          resourceId: subnet.id || subnet.name,
          resourceName: subnet.name,
          title: 'Subnet is very small',
          description: `Subnet "${subnet.name}" uses /${prefix} which provides very few usable addresses (Azure reserves 5 addresses per subnet). Consider using at least /28.`,
          sourceUrl: 'https://learn.microsoft.com/en-us/azure/virtual-network/virtual-networks-faq#are-there-any-restrictions-on-using-ip-addresses-within-these-subnets',
          autoFixPrompt: `Increase the size of subnet "${subnet.name}" in VNet "${vnetName}" to at least /28.`,
        });
      }
    }

    // ── Rule 11: AzureFirewallSubnet should not contain non-firewall resources ──
    if (subnet.name === 'AzureFirewallSubnet') {
      const nonFirewallResources = subnetResources.filter(r => {
        const nt = normaliseType(r.type);
        return !nt.includes('firewall') || nt.includes('policy');
      });
      if (nonFirewallResources.length > 0) {
        findings.push({
          id: nextId(),
          severity: 'error',
          category: 'placement',
          resourceId: subnet.id || subnet.name,
          resourceName: subnet.name,
          title: 'AzureFirewallSubnet should only contain Azure Firewall',
          description: `AzureFirewallSubnet in VNet "${vnetName}" contains ${nonFirewallResources.length} non-firewall resource(s): ${nonFirewallResources.map(r => r.name).join(', ')}. This subnet is reserved for Azure Firewall only.`,
          sourceUrl: 'https://learn.microsoft.com/en-us/azure/firewall/tutorial-firewall-deploy-portal',
          autoFixPrompt: `Remove non-firewall resources from AzureFirewallSubnet in VNet "${vnetName}" and place them in other subnets.`,
        });
      }
    }

    // ── Rule 12: AzureBastionSubnet should not contain non-bastion resources ──
    if (subnet.name === 'AzureBastionSubnet') {
      const nonBastionResources = subnetResources.filter(r => {
        const nt = normaliseType(r.type);
        return !nt.includes('bastion');
      });
      if (nonBastionResources.length > 0) {
        findings.push({
          id: nextId(),
          severity: 'error',
          category: 'placement',
          resourceId: subnet.id || subnet.name,
          resourceName: subnet.name,
          title: 'AzureBastionSubnet should only contain Azure Bastion',
          description: `AzureBastionSubnet in VNet "${vnetName}" contains ${nonBastionResources.length} non-bastion resource(s): ${nonBastionResources.map(r => r.name).join(', ')}.`,
          sourceUrl: 'https://learn.microsoft.com/en-us/azure/bastion/configuration-settings#subnet',
          autoFixPrompt: `Remove non-bastion resources from AzureBastionSubnet in VNet "${vnetName}" and place them in other subnets.`,
        });
      }
    }

    // ── Rule 13: Subnet without address prefix specified ──
    if (!subnet.addressPrefix) {
      findings.push({
        id: nextId(),
        severity: 'info',
        category: 'subnet',
        resourceId: subnet.id || subnet.name,
        resourceName: subnet.name,
        title: 'Subnet has no address prefix defined',
        description: `Subnet "${subnet.name}" in VNet "${vnetName}" doesn't have an address prefix specified. Consider adding one for a complete architecture.`,
        autoFixPrompt: `Add an appropriate CIDR address prefix to subnet "${subnet.name}" in VNet "${vnetName}".`,
      });
    }
  }

  // ── Rule 14: VNet without address space ──
  for (const { vnet, context } of walk.vnets) {
    if (!vnet.addressSpace) {
      findings.push({
        id: nextId(),
        severity: 'info',
        category: 'subnet',
        resourceId: vnet.id || vnet.name,
        resourceName: vnet.name,
        title: 'VNet has no address space defined',
        description: `VNet "${vnet.name}" doesn't have an address space specified. Consider defining one for IP planning.`,
        autoFixPrompt: `Add an address space (e.g., 10.0.0.0/16) to VNet "${vnet.name}".`,
      });
    }

    // ── Rule 15: VNet address space must be valid CIDR ──
    if (vnet.addressSpace && !isValidCIDR(vnet.addressSpace)) {
      findings.push({
        id: nextId(),
        severity: 'error',
        category: 'subnet',
        resourceId: vnet.id || vnet.name,
        resourceName: vnet.name,
        title: 'Invalid VNet address space CIDR',
        description: `VNet "${vnet.name}" has address space "${vnet.addressSpace}" which is not valid CIDR notation.`,
        autoFixPrompt: `Fix the address space for VNet "${vnet.name}" to use valid CIDR notation (e.g., 10.0.0.0/16).`,
      });
    }

    // ── Rule 16: VNet has no subnets ──
    if (!vnet.subnets || vnet.subnets.length === 0) {
      findings.push({
        id: nextId(),
        severity: 'warning',
        category: 'config',
        resourceId: vnet.id || vnet.name,
        resourceName: vnet.name,
        title: 'VNet has no subnets',
        description: `VNet "${vnet.name}" has no subnets defined. Resources should be placed in subnets for proper network segmentation.`,
        autoFixPrompt: `Add appropriate subnets to VNet "${vnet.name}" for the resources that need network connectivity.`,
      });
    }
  }

  return findings;
}
