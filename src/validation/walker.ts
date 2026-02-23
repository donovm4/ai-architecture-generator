/**
 * Architecture Walker
 *
 * Traverses the nested Architecture object and yields a flat
 * WalkResult with all resources, vnets, subnets, and connections
 * along with their hierarchical context.
 */

import type { Architecture, Resource, VNet, Subnet, ResourceGroup, Region, Subscription, Connection } from '../schema/types.js';
import type { WalkResult, WalkedResource, WalkedVNet, WalkedSubnet, ResourceContext } from './types.js';

export function walkArchitecture(arch: Architecture): WalkResult {
  const resources: WalkedResource[] = [];
  const vnets: WalkedVNet[] = [];
  const subnets: WalkedSubnet[] = [];
  const connections: Connection[] = arch.connections ?? [];
  const globalResources: Resource[] = arch.globalResources ?? [];

  // Walk global resources
  for (const r of globalResources) {
    resources.push({ resource: r, context: {} });
  }

  // Helper: process a single resource (might be VNet)
  function processResource(r: Resource | VNet, ctx: ResourceContext) {
    if (isVNet(r)) {
      const vnet = r as VNet;
      const vnetCtx: ResourceContext = { ...ctx, vnetName: vnet.name, vnetAddressSpace: vnet.addressSpace };
      vnets.push({ vnet, context: vnetCtx });
      resources.push({ resource: vnet as unknown as Resource, context: vnetCtx });

      for (const subnet of vnet.subnets ?? []) {
        const subCtx: ResourceContext = {
          ...vnetCtx,
          subnetName: subnet.name,
          subnetAddressPrefix: subnet.addressPrefix,
        };
        subnets.push({
          subnet,
          vnetName: vnet.name,
          vnetAddressSpace: vnet.addressSpace,
          context: subCtx,
        });
        resources.push({ resource: subnet as unknown as Resource, context: subCtx });

        // Resources inside subnet
        for (const sr of subnet.resources ?? []) {
          resources.push({ resource: sr, context: subCtx });
        }

        // Resources inside availability zones inside subnet
        for (const az of subnet.availabilityZones ?? []) {
          for (const azr of az.resources ?? []) {
            resources.push({ resource: azr, context: subCtx });
          }
        }
      }
    } else {
      resources.push({ resource: r, context: ctx });
    }
  }

  // Helper: process resource group
  function processRG(rg: ResourceGroup, ctx: ResourceContext) {
    const rgCtx: ResourceContext = { ...ctx, resourceGroupName: rg.name };
    for (const r of rg.resources ?? []) {
      processResource(r, rgCtx);
    }
  }

  // Helper: process region
  function processRegion(region: Region, ctx: ResourceContext) {
    const regionCtx: ResourceContext = { ...ctx, regionName: region.name || region.code };
    for (const rg of region.resourceGroups ?? []) {
      processRG(rg, regionCtx);
    }
    for (const r of region.resources ?? []) {
      processResource(r, regionCtx);
    }
  }

  // Helper: process subscription
  function processSub(sub: Subscription) {
    const subCtx: ResourceContext = { subscriptionName: sub.name };
    for (const region of sub.regions ?? []) {
      processRegion(region, subCtx);
    }
    for (const rg of sub.resourceGroups ?? []) {
      processRG(rg, subCtx);
    }
  }

  // Walk all entry points into the architecture
  // 1. subscriptions[]
  for (const sub of arch.subscriptions ?? []) {
    processSub(sub);
  }
  // 2. subscription (singular)
  if (arch.subscription) {
    processSub(arch.subscription);
  }
  // 3. regions[] at top level
  for (const region of arch.regions ?? []) {
    processRegion(region, {});
  }
  // 4. onPremises[]
  for (const op of arch.onPremises ?? []) {
    for (const r of op.resources ?? []) {
      resources.push({ resource: r, context: {} });
    }
  }
  // 5. pages[] (multi-page diagrams)
  for (const page of arch.pages ?? []) {
    if (page.subscription) processSub(page.subscription);
    for (const region of page.regions ?? []) {
      processRegion(region, {});
    }
    for (const rg of page.resourceGroups ?? []) {
      processRG(rg, {});
    }
    for (const conn of page.connections ?? []) {
      connections.push(conn);
    }
    for (const gr of page.globalResources ?? []) {
      resources.push({ resource: gr, context: {} });
      globalResources.push(gr);
    }
    for (const op of page.onPremises ?? []) {
      for (const r of op.resources ?? []) {
        resources.push({ resource: r, context: {} });
      }
    }
  }

  return { resources, vnets, subnets, connections, globalResources };
}

function isVNet(r: Resource | VNet): r is VNet {
  const t = (r.type || '').toLowerCase();
  return t === 'vnet' || t === 'hubvnet' || t === 'hub vnet' || t === 'virtual network'
    || t === 'microsoft.network/virtualnetworks';
}
