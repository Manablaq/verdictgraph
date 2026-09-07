"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  ExternalLink,
  Settings2,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ConfigurationRequired } from "@/components/configuration-required";
import {
  explorerAddress,
  getAdjudicatorAddress,
  getRegistryAddress,
  getVaultAddress,
  isProtocolConfigured,
  readRegistry,
} from "@/lib/genlayer/client";
import { shortAddress } from "@/lib/format";
import {
  verifyVaultTopology,
} from "@/lib/genlayer/vault";

async function loadSetup() {
  const [
    registryOwner,
    topology,
  ] = await Promise.all([
    readRegistry<string>("get_owner"),
    verifyVaultTopology(),
  ]);

  return {
    registryOwner,
    topology,
  };
}

export default function SetupPage() {
  const registry =
    getRegistryAddress();

  const adjudicator =
    getAdjudicatorAddress();

  const vault =
    getVaultAddress();

  const configured =
    isProtocolConfigured();

  const query = useQuery({
    queryKey: [
      "protocol-six-way-topology",
    ],
    queryFn: loadSetup,
    enabled: configured,
  });

  return (
    <AppShell>
      <div className="max-w-4xl">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[.2em] text-zinc-600">
          <Settings2 size={14} />
          Deployment topology
        </div>

        <h1 className="mt-2 text-4xl font-semibold tracking-[-.04em]">
          Verify the full economic boundary.
        </h1>

        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-500">
          VerdictGraph verifies both Intelligent
          Contracts, their reciprocal binding, both
          finalized Vault bindings, and both immutable
          Vault controller addresses.
        </p>
      </div>

      {!configured ? (
        <div className="mt-7">
          <ConfigurationRequired />
        </div>
      ) : query.isLoading ? (
        <div className="mt-8 text-sm text-zinc-600">
          Verifying finalized six-way topology…
        </div>
      ) : query.isError || !query.data ? (
        <div className="mt-8 rounded-2xl border border-rose-400/15 bg-rose-400/[.04] p-5 text-sm text-rose-200">
          Six-way topology verification failed:{" "}
          {query.error instanceof Error
            ? query.error.message
            : "Unknown topology error"}
        </div>
      ) : (
        <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_.72fr]">
          <section className="rounded-[28px] border border-white/[.08] bg-white/[.02] p-6">
            <div className="text-xs uppercase tracking-[.17em] text-zinc-600">
              Audited Bradbury deployment
            </div>

            <dl className="mt-5 space-y-4 text-sm">
              <Row
                label="Registry"
                value={registry ?? "Invalid"}
                link={
                  registry
                    ? explorerAddress(registry)
                    : undefined
                }
              />

              <Row
                label="Registry owner"
                value={
                  query.data.registryOwner
                }
              />

              <Row
                label="Adjudicator"
                value={
                  adjudicator ?? "Invalid"
                }
                link={
                  adjudicator
                    ? explorerAddress(
                        adjudicator,
                      )
                    : undefined
                }
              />

              <Row
                label="Vault"
                value={vault ?? "Invalid"}
                link={
                  vault
                    ? explorerAddress(vault)
                    : undefined
                }
              />

              <Row
                label="Registry → Adjudicator"
                value={
                  query.data.topology
                    .registryAdjudicator
                }
              />

              <Row
                label="Adjudicator → Registry"
                value={
                  query.data.topology
                    .adjudicatorRegistry
                }
              />

              <Row
                label="Registry → Vault"
                value={
                  query.data.topology
                    .registryVault
                }
              />

              <Row
                label="Adjudicator → Vault"
                value={
                  query.data.topology
                    .adjudicatorVault
                }
              />

              <Row
                label="Vault → Registry"
                value={
                  query.data.topology
                    .vaultRegistry
                }
              />

              <Row
                label="Vault → Adjudicator"
                value={
                  query.data.topology
                    .vaultAdjudicator
                }
              />
            </dl>
          </section>

          <aside className="rounded-[28px] border border-emerald-300/15 bg-emerald-300/[.035] p-6">
            <CheckCircle2
              size={20}
              className="text-emerald-300"
            />

            <h2 className="mt-5 font-medium">
              Six-way topology verified
            </h2>

            <p className="mt-3 text-sm leading-6 text-zinc-500">
              Registry, Adjudicator and Vault all
              reference the exact audited counterpart
              addresses. No rebinding action is exposed.
            </p>
          </aside>
        </div>
      )}
    </AppShell>
  );
}

function Row({
  label,
  value,
  link,
}: {
  label: string;
  value: string;
  link?: string;
}) {
  return (
    <div className="flex flex-col justify-between gap-1 border-b border-white/[.06] pb-3 sm:flex-row sm:items-center">
      <dt className="text-zinc-600">
        {label}
      </dt>

      <dd className="flex items-center gap-2 font-mono text-xs text-zinc-300">
        <span title={value}>
          {value.startsWith("0x")
            ? shortAddress(value)
            : value}
        </span>

        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="text-zinc-600 hover:text-zinc-200"
            aria-label={
              `Open ${label} in explorer`
            }
          >
            <ExternalLink size={13} />
          </a>
        ) : null}
      </dd>
    </div>
  );
}
