/**
 * Network Validation Rules
 *
 * Validates Azure network topology: hub-spoke patterns, peering,
 * UDR requirements, NSG placement, and address space conflicts.
 */

import type { ValidationFinding, WalkResult } from '../types.js';

/** Normalise resource type to lowercase for comparison */
function normaliseType(type: string): string {
  return (type || '').toLowerCase().replace(/[\s_-]/g, '');
}

/** Parse CIDR into network address number and prefix length */
function parseCIDR(cidr: string): { networkNum: number; prefix: number } | null {
  const match = cidr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/);
  if (!match) return null;
  const octets = [parseInt(match[1]), parseInt(match[2]), parseInt(match[3]), parseInt(match[4])];
  if (octets.some(o => o > 255)) return null;
  const prefix = parseInt(match[5]);
  if (prefix < 0 || prefix > 32) return null;
  const networkNum = (octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3];
  return { networkNum, prefix };
}

/** Check if two CIDR ranges overlap */
function cidrsOverlap(cidr1: string, cidr2: string): boolean {
  const a = parseCIDR(cidr1);
  const b = parseCIDR(cidr2);
  if (!a || !b) return false;

  const maskA = a.prefix === 0 ? 0 : (~0 << (32 - a.prefix)) >>> 0;
  const maskB = b.prefix === 0 ? 0 : (~0 << (32 - b.prefix)) >>> 0;

  const startA = (a.networkNum & maskA) >>> 0;
  const endA = (startA | (~maskA >>> 0)) >>> 0;
  const startB = (b.networkNum & maskB) >>> 0;
  const endB = (startB | (~maskB >>> 0)) >>> 0;

  return startA <= endB && startB <= endA;
}

let ruleCounter = 0;
function nextId(): string {
  return `network-${++ruleCounter}`;
}

export function networkRules(walk: WalkResult): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  ruleCounter = 0;

  // Build lookup maps
  const vnetNames = new Map<string, { addressSpace?: string; hasFirewall: boolean; hasRouteTable: boolean; isHub: boolean }>();
  const subnetsByVNet = new Map<string, Array<{ name: string; resources: string[] }>>();

  for (const { vnet } of walk.vnets) {
    const subnets = vnet.subnets ?? [];
    const hasFirewall = subnets.some(s =>
      (s.resources ?? []).some(r => {
        const nt = normaliseType(r.type);
        return nt.includes('firewall') && !nt.includes('policy') && !nt.includes('waf');
      })
    );
    const isHub = normaliseType(vnet.type).includes('hub')
      || vnet.name.toLowerCase().includes('hub');

    vnetNames.set(vnet.name.toLowerCase(), {
      addressSpace: vnet.addressSpace,
      hasFirewall,
      hasRouteTable: false, // updated below
      isHub,
    });

    subnetsByVNet.set(vnet.name.toLowerCase(), subnets.map(s => ({
      name: s.name,
      resources: (s.resources ?? []).map(r => normaliseType(r.type)),
    })));
  }

  // Check if route tables exist in resources
  const hasRouteTable = walk.resources.some(r =>
    normaliseType(r.resource.type).includes('routetable') || normaliseType(r.resource.type) === 'udr'
  );
  // Update vnet info
  for (const [, info] of vnetNames) {
    info.hasRouteTable = hasRouteTable;
  }

  // ── Rule 1: VNets with Firewall should have UDR for spoke traffic ──
  for (const [vnetName, info] of vnetNames) {
    if (info.hasFirewall && !info.hasRouteTable) {
      findings.push({
        id: nextId(),
        severity: 'warning',
        category: 'network',
        resourceId: vnetName,
        resourceName: vnetName,
        title: 'Firewall VNet should have route tables (UDR)',
        description: `VNet "${vnetName}" contains an Azure Firewall but no Route Table (UDR) was found in the architecture. Spoke traffic should be routed through the firewall via UDRs.`,
        sourceUrl: 'https://learn.microsoft.com/en-us/azure/firewall/tutorial-firewall-deploy-portal#create-a-default-route',
        autoFixPrompt: `Add a Route Table (UDR) with a default route (0.0.0.0/0) pointing to the Azure Firewall's private IP for spoke subnets.`,
      });
    }
  }

  // ── Rule 2: Peered VNets should not have overlapping address spaces ──
  for (const { vnet } of walk.vnets) {
    if (!vnet.peerings || !vnet.addressSpace) continue;
    for (const peering of vnet.peerings) {
      const remoteVNetKey = peering.remoteVnet.toLowerCase();
      const remoteInfo = vnetNames.get(remoteVNetKey);
      if (remoteInfo?.addressSpace && vnet.addressSpace) {
        if (cidrsOverlap(vnet.addressSpace, remoteInfo.addressSpace)) {
          findings.push({
            id: nextId(),
            severity: 'error',
            category: 'network',
            resourceId: vnet.id || vnet.name,
            resourceName: vnet.name,
            title: 'Peered VNets have overlapping address spaces',
            description: `VNet "${vnet.name}" (${vnet.addressSpace}) is peered with "${peering.remoteVnet}" (${remoteInfo.addressSpace}) but their address spaces overlap. VNet peering requires non-overlapping address spaces.`,
            sourceUrl: 'https://learn.microsoft.com/en-us/azure/virtual-network/virtual-network-peering-overview#requirements-and-constraints',
            autoFixPrompt: `Change the address spaces of VNet "${vnet.name}" or "${peering.remoteVnet}" so they don't overlap.`,
          });
        }
      }
    }
  }

  // ── Rule 3: NSGs should be on subnets with VMs ──
  for (const { subnet, vnetName } of walk.subnets) {
    const subnetResources = subnet.resources ?? [];
    const hasVM = subnetResources.some(r => {
      const nt = normaliseType(r.type);
      return nt === 'vm' || nt.includes('virtualmachine');
    });
    const hasVMSS = subnetResources.some(r => {
      const nt = normaliseType(r.type);
      return nt === 'vmss' || nt.includes('virtualmachinescaleset');
    });

    if ((hasVM || hasVMSS) && !subnet.nsg) {
      // Check if the subnet name is one of the special ones that shouldn't have NSGs
      if (subnet.name !== 'GatewaySubnet' && subnet.name !== 'AzureFirewallSubnet') {
        findings.push({
          id: nextId(),
          severity: 'warning',
          category: 'network',
          resourceId: subnet.id || subnet.name,
          resourceName: subnet.name,
          title: 'Subnet with VMs should have an NSG',
          description: `Subnet "${subnet.name}" in VNet "${vnetName}" contains VMs but has no NSG attached. NSGs provide network-level access control.`,
          sourceUrl: 'https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview',
          autoFixPrompt: `Add a Network Security Group (NSG) to subnet "${subnet.name}" in VNet "${vnetName}" with appropriate inbound and outbound rules.`,
        });
      }
    }
  }

  // ── Rule 4: Hub-spoke topology: spokes should peer to hub ──
  const hubVnets = [...vnetNames.entries()].filter(([, info]) => info.isHub);
  const spokeVnets = [...vnetNames.entries()].filter(([, info]) => !info.isHub);

  if (hubVnets.length > 0 && spokeVnets.length > 0) {
    for (const { vnet } of walk.vnets) {
      if (normaliseType(vnet.type).includes('hub') || vnet.name.toLowerCase().includes('hub')) continue;

      const peerings = vnet.peerings ?? [];
      const peersToHub = peerings.some(p =>
        hubVnets.some(([hubName]) => p.remoteVnet.toLowerCase() === hubName)
      );

      if (!peersToHub && peerings.length === 0) {
        findings.push({
          id: nextId(),
          severity: 'warning',
          category: 'network',
          resourceId: vnet.id || vnet.name,
          resourceName: vnet.name,
          title: 'Spoke VNet should peer to the hub',
          description: `VNet "${vnet.name}" appears to be a spoke but has no peering to the hub VNet. In a hub-spoke topology, spokes should peer to the hub for centralized connectivity.`,
          sourceUrl: 'https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/hybrid-networking/hub-spoke',
          autoFixPrompt: `Add a VNet peering from spoke VNet "${vnet.name}" to the hub VNet.`,
        });
      }
    }
  }

  // ── Rule 5: Spokes should not peer directly to each other ──
  if (hubVnets.length > 0) {
    for (const { vnet } of walk.vnets) {
      const vnetKey = vnet.name.toLowerCase();
      const isHub = vnetNames.get(vnetKey)?.isHub;
      if (isHub) continue;

      for (const peering of vnet.peerings ?? []) {
        const remoteName = peering.remoteVnet.toLowerCase();
        const remoteInfo = vnetNames.get(remoteName);
        if (remoteInfo && !remoteInfo.isHub) {
          findings.push({
            id: nextId(),
            severity: 'warning',
            category: 'network',
            resourceId: vnet.id || vnet.name,
            resourceName: vnet.name,
            title: 'Spoke-to-spoke peering detected',
            description: `VNet "${vnet.name}" (spoke) is peered directly to "${peering.remoteVnet}" (spoke). In hub-spoke topologies, spoke traffic should route through the hub for centralized control.`,
            sourceUrl: 'https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/hybrid-networking/hub-spoke#spoke-connectivity',
            autoFixPrompt: `Remove the direct peering between spokes "${vnet.name}" and "${peering.remoteVnet}". Route traffic through the hub VNet instead.`,
          });
        }
      }
    }
  }

  // ── Rule 6: Hub VNet should have Firewall or NVA for traffic inspection ──
  for (const [hubName, info] of hubVnets) {
    if (!info.hasFirewall) {
      findings.push({
        id: nextId(),
        severity: 'info',
        category: 'network',
        resourceId: hubName,
        resourceName: hubName,
        title: 'Hub VNet has no firewall or NVA',
        description: `Hub VNet "${hubName}" doesn't contain an Azure Firewall or NVA. Consider adding one for traffic inspection and centralized security.`,
        sourceUrl: 'https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/hybrid-networking/hub-spoke',
        autoFixPrompt: `Add an Azure Firewall to the hub VNet "${hubName}" in a dedicated "AzureFirewallSubnet" subnet.`,
      });
    }
  }

  // ── Rule 7: Multiple VNets without peering ──
  if (walk.vnets.length > 1) {
    const vnetsWithPeering = walk.vnets.filter(({ vnet }) =>
      (vnet.peerings ?? []).length > 0
    );
    const vnetsWithoutPeering = walk.vnets.filter(({ vnet }) =>
      (vnet.peerings ?? []).length === 0
    );

    // Also check connections for peering-style connections
    const peeringConnections = walk.connections.filter(c =>
      c.style === 'peering' || (c.label ?? '').toLowerCase().includes('peering')
    );

    if (vnetsWithoutPeering.length > 0 && vnetsWithPeering.length === 0 && peeringConnections.length === 0) {
      findings.push({
        id: nextId(),
        severity: 'info',
        category: 'network',
        resourceId: 'architecture',
        resourceName: 'Architecture',
        title: 'Multiple VNets without peering configured',
        description: `The architecture has ${walk.vnets.length} VNets but no peering is configured between them. If these VNets need to communicate, add VNet peering.`,
        sourceUrl: 'https://learn.microsoft.com/en-us/azure/virtual-network/virtual-network-peering-overview',
        autoFixPrompt: `Add VNet peering between the VNets that need to communicate with each other.`,
      });
    }
  }

  // ── Rule 8: GatewaySubnet should not have NSG ──
  for (const { subnet, vnetName } of walk.subnets) {
    if (subnet.name === 'GatewaySubnet' && subnet.nsg) {
      findings.push({
        id: nextId(),
        severity: 'warning',
        category: 'network',
        resourceId: subnet.id || subnet.name,
        resourceName: subnet.name,
        title: 'GatewaySubnet should not have an NSG',
        description: `GatewaySubnet in VNet "${vnetName}" has an NSG attached. While possible, NSGs on GatewaySubnet can cause issues with VPN/ExpressRoute connectivity and Microsoft recommends against it.`,
        sourceUrl: 'https://learn.microsoft.com/en-us/azure/vpn-gateway/vpn-gateway-about-vpn-gateway-settings#gwsub',
        autoFixPrompt: `Remove the NSG from GatewaySubnet in VNet "${vnetName}".`,
      });
    }
  }

  // ── Rule 9: VPN + ExpressRoute coexistence check ──
  {
    const allSubnetResources = walk.subnets.flatMap(s => s.subnet.resources ?? []);
    const hasVPN = allSubnetResources.some(r => {
      const nt = normaliseType(r.type);
      return nt.includes('vpngateway') || nt.includes('virtualnetworkgateway');
    });
    const hasER = walk.resources.some(r => {
      const nt = normaliseType(r.resource.type);
      return nt.includes('expressroute');
    });
    if (hasVPN && hasER) {
      findings.push({
        id: nextId(),
        severity: 'info',
        category: 'network',
        resourceId: 'architecture',
        resourceName: 'Architecture',
        title: 'VPN and ExpressRoute coexistence detected',
        description: 'The architecture uses both VPN Gateway and ExpressRoute. Ensure they are configured for coexistence - both can share the same GatewaySubnet but need separate gateway resources.',
        sourceUrl: 'https://learn.microsoft.com/en-us/azure/expressroute/expressroute-howto-coexist-resource-manager',
      });
    }
  }

  // ── Rule 10: Public IP resources should be Standard SKU (info) ──
  const publicIps = walk.resources.filter(r => {
    const nt = normaliseType(r.resource.type);
    return nt === 'publicip' || nt.includes('publicipaddress') || nt === 'pip';
  });
  if (publicIps.length > 0) {
    for (const pip of publicIps) {
      const sku = (pip.resource.properties?.sku as string || '').toLowerCase();
      if (sku === 'basic') {
        findings.push({
          id: nextId(),
          severity: 'warning',
          category: 'config',
          resourceId: pip.resource.id || pip.resource.name,
          resourceName: pip.resource.name,
          title: 'Public IP uses Basic SKU',
          description: `Public IP "${pip.resource.name}" uses Basic SKU. Basic SKU public IPs will be retired. Use Standard SKU instead.`,
          sourceUrl: 'https://learn.microsoft.com/en-us/azure/virtual-network/ip-services/public-ip-basic-upgrade-guidance',
          autoFixPrompt: `Change Public IP "${pip.resource.name}" to Standard SKU.`,
        });
      }
    }
  }

  return findings;
}
