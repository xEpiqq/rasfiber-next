'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/table';
import { Checkbox } from '@/components/checkbox';
import { ChevronDownIcon, ChevronUpIcon, EllipsisVerticalIcon } from '@heroicons/react/20/solid';
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
  DropdownDivider,
} from '@/components/dropdown';

export default function ReportsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const [reportLines, setReportLines] = useState([]);
  const [expandedAgents, setExpandedAgents] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [wgeMap, setWgeMap] = useState({});

  useEffect(() => {
    fetchBatches();
  }, []);

  async function fetchBatches() {
    setLoading(true);
    const { data: batchData } = await supabase
      .from('payroll_report_batches')
      .select('*')
      .order('created_at', { ascending: false });

    if (batchData) {
      setBatches(batchData);
    }
    setLoading(false);
  }

  async function loadBatchDetails(batch_id) {
    setLoading(true);
    const { data } = await supabase
      .from('payroll_reports')
      .select('*')
      .eq('batch_id', batch_id);

    if (data) {
      data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      const allIds = [];
      for (const line of data) {
        if (Array.isArray(line.details)) {
          for (const d of line.details) {
            if (d.white_glove_entry_id) allIds.push(d.white_glove_entry_id);
          }
        }
      }

      let wgeById = {};
      if (allIds.length > 0) {
        const { data: wgeData } = await supabase
          .from('white_glove_entries')
          .select('*')
          .in('id', allIds);
        (wgeData || []).forEach(w => { wgeById[w.id] = w; });
      }

      // Auto-update frontend_is_paid if all accounts paid
      for (let i = 0; i < data.length; i++) {
        const line = data[i];
        const lineAccs = Array.isArray(line.details) ? line.details : [];
        const allPaid = lineAccs.length > 0 && lineAccs.every(d => {
          const w = wgeById[d.white_glove_entry_id];
          return w && w.frontend_paid;
        });
        if (allPaid && !line.frontend_is_paid) {
          line.frontend_is_paid = true;
          supabase.from('payroll_reports').update({ frontend_is_paid: true }).eq('id', line.id);
        }
      }

      setReportLines(data);
      setWgeMap(wgeById);
      setExpandedAgents(new Set());
    }
    setLoading(false);
  }

  function enterBatch(batch_id) {
    setSelectedBatchId(batch_id);
    loadBatchDetails(batch_id);
  }

  function goBack() {
    setSelectedBatchId(null);
    setReportLines([]);
    setWgeMap({});
  }

  function toggleAgentExpand(line) {
    setExpandedAgents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(line.id)) newSet.delete(line.id);
      else newSet.add(line.id);
      return newSet;
    });
  }

  async function togglePaid(line) {
    const newPaidValue = !line.frontend_is_paid;
    const { data: updatedLineData } = await supabase
      .from('payroll_reports')
      .update({ frontend_is_paid: newPaidValue })
      .eq('id', line.id)
      .select('*');
    if (!updatedLineData) return;
    let updatedLine = updatedLineData[0];

    const lineAccs = Array.isArray(updatedLine.details) ? updatedLine.details : [];
    const wgeIds = lineAccs.map(d => d.white_glove_entry_id);
    if (wgeIds.length > 0) {
      await supabase
        .from('white_glove_entries')
        .update({ frontend_paid: newPaidValue })
        .in('id', wgeIds);

      const newWgeMap = { ...wgeMap };
      wgeIds.forEach(id => {
        if (newWgeMap[id]) newWgeMap[id].frontend_paid = newPaidValue;
      });
      setWgeMap(newWgeMap);
    }

    setReportLines(prev => prev.map(r => r.id === line.id ? updatedLine : r));
    if (newPaidValue) setExpandedAgents(prev => new Set([...prev, updatedLine.id]));
  }

  async function toggleAccountPaid(line, wgeId) {
    const w = wgeMap[wgeId];
    if (!w) return;
    const newPaidValue = !w.frontend_paid;

    await supabase
      .from('white_glove_entries')
      .update({ frontend_paid: newPaidValue })
      .eq('id', wgeId);

    const newWgeMap = { ...wgeMap };
    newWgeMap[wgeId].frontend_paid = newPaidValue;
    setWgeMap(newWgeMap);

    const lineAccs = Array.isArray(line.details) ? line.details : [];
    const allPaid = lineAccs.every(d => {
      const ww = newWgeMap[d.white_glove_entry_id];
      return ww && ww.frontend_paid;
    });
    if (allPaid && !line.frontend_is_paid) {
      await supabase
        .from('payroll_reports')
        .update({ frontend_is_paid: true })
        .eq('id', line.id);
      setReportLines(prev => prev.map(r => r.id === line.id ? { ...r, frontend_is_paid: true } : r));
    } else if (!allPaid && line.frontend_is_paid) {
      await supabase
        .from('payroll_reports')
        .update({ frontend_is_paid: false })
        .eq('id', line.id);
      setReportLines(prev => prev.map(r => r.id === line.id ? { ...r, frontend_is_paid: false } : r));
    }
  }

  function getPaidPercentage() {
    if (reportLines.length === 0) return '0%';
    const paidCount = reportLines.filter((r) => r.frontend_is_paid).length;
    return ((paidCount / reportLines.length) * 100).toFixed(2) + '%';
  }

  // Batch Actions
  async function renameBatch(batch) {
    const newName = window.prompt('Enter new batch name', batch.batch_name);
    if (newName && newName.trim()) {
      await supabase.from('payroll_report_batches').update({ batch_name: newName.trim() }).eq('id', batch.id);
      fetchBatches();
    }
  }

  async function deleteBatch(batch) {
    if (confirm(`Are you sure you want to delete ${batch.batch_name}?`)) {
      // Delete associated payroll_reports first
      await supabase.from('payroll_reports').delete().eq('batch_id', batch.id);
      await supabase.from('payroll_report_batches').delete().eq('id', batch.id);
      fetchBatches();
    }
  }

  if (!selectedBatchId) {
    return (
      <div className="p-6 space-y-6 font-sans text-gray-900">
        <h2 className="text-2xl font-bold text-center">Saved Payroll Batches (Frontend)</h2>
        {loading && <div>Loading...</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 relative">
          {batches.map((batch) => (
            <div
              key={batch.id}
              className="border rounded p-4 hover:bg-gray-50 relative flex flex-col items-center"
            >
              <span onClick={() => enterBatch(batch.id)} className="text-lg font-semibold cursor-pointer text-center">
                {batch.batch_name}
              </span>
              <div className="text-sm text-gray-500 text-center">
                Created at: {new Date(batch.created_at).toLocaleString()}
              </div>
              <div className="mt-2">
                <Dropdown>
                  <DropdownButton as="div" className="cursor-pointer flex justify-center">
                    <EllipsisVerticalIcon className="h-5 w-5 text-gray-500" />
                  </DropdownButton>
                  <DropdownMenu className="min-w-32" anchor="bottom end">
                    <DropdownItem onClick={() => renameBatch(batch)}>Rename</DropdownItem>
                    <DropdownDivider />
                    <DropdownItem onClick={() => deleteBatch(batch)}>Delete</DropdownItem>
                  </DropdownMenu>
                </Dropdown>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 font-sans text-gray-900">
      <Button onClick={goBack}>Back to Batches</Button>
      <h3 className="text-lg font-bold mt-4">Batch Details (Frontend)</h3>
      <div className="flex items-center space-x-4 mb-4">
        <div>Total lines: {reportLines.length}</div>
        <div>Paid: {getPaidPercentage()}</div>
      </div>
      {loading && <div>Loading...</div>}
      <Table striped>
        <TableHead>
          <TableRow>
            <TableHeader></TableHeader>
            <TableHeader>Paid?</TableHeader>
            <TableHeader>Name</TableHeader>
            <TableHeader># Accounts</TableHeader>
            <TableHeader>Personal Total</TableHeader>
            <TableHeader>Manager Total</TableHeader>
            <TableHeader>Grand Total</TableHeader>
            <TableHeader>Upfront</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {reportLines.map((line) => {
            const isAgentExpanded = expandedAgents.has(line.id);
            const personalTotalDisplay = typeof line.personal_total === 'number' ? `$${line.personal_total.toFixed(2)}` : 'N/A';
            const managerTotalDisplay = (typeof line.manager_total === 'number' && line.manager_total > 0)
              ? `$${line.manager_total.toFixed(2)}` : 'N/A';
            const grandTotalDisplay = typeof line.grand_total === 'number' ? `$${line.grand_total.toFixed(2)}` : 'N/A';
            const upfrontDisplay = (line.upfront_value !== null && !isNaN(line.upfront_value))
              ? `$${line.upfront_value.toFixed(2)} (${line.upfront_percentage}%)`
              : 'N/A';

            const lineAccs = Array.isArray(line.details) ? line.details : [];

            return (
              <React.Fragment key={line.id}>
                <TableRow className={line.frontend_is_paid ? 'bg-green-100' : ''}>
                  <TableCell>
                    <Button size="sm" variant="plain" onClick={() => toggleAgentExpand(line)}>
                      {isAgentExpanded ? <ChevronUpIcon className="h-5 w-5" /> : <ChevronDownIcon className="h-5 w-5" />}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={line.frontend_is_paid}
                      onChange={() => togglePaid(line)}
                    />
                  </TableCell>
                  <TableCell>{line.name}</TableCell>
                  <TableCell>{line.accounts}</TableCell>
                  <TableCell>{personalTotalDisplay}</TableCell>
                  <TableCell>{managerTotalDisplay}</TableCell>
                  <TableCell>{grandTotalDisplay}</TableCell>
                  <TableCell>{upfrontDisplay}</TableCell>
                </TableRow>
                {isAgentExpanded && (
                  <TableRow>
                    <TableCell colSpan={8} className="bg-gray-50">
                      <div className="p-4">
                        <h4 className="font-bold mb-2">Sales Details</h4>
                        <Table striped>
                          <TableHead>
                            <TableRow>
                              <TableHeader></TableHeader>
                              <TableHeader>Order Number</TableHeader>
                              <TableHeader>Customer Name</TableHeader>
                              <TableHeader>Address</TableHeader>
                              <TableHeader>Plan</TableHeader>
                              <TableHeader>Install Date</TableHeader>
                              <TableHeader>Personal Commission</TableHeader>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {lineAccs.map((acc, idx) => {
                              const w = wgeMap[acc.white_glove_entry_id];
                              if (!w) return null;
                              const personalCommDisplay = `$${(acc.personal_commission || 0).toFixed(2)}`;
                              const installDateDisplay = w.install_date ? new Date(w.install_date).toLocaleDateString() : 'N/A';
                              return (
                                <TableRow key={idx} className={w.frontend_paid ? 'bg-green-50' : ''}>
                                  <TableCell>
                                    <Checkbox
                                      checked={!!w.frontend_paid}
                                      onChange={() => toggleAccountPaid(line, w.id)}
                                    />
                                  </TableCell>
                                  <TableCell>{w.order_number}</TableCell>
                                  <TableCell>{w.customer_name}</TableCell>
                                  <TableCell>{`${w.customer_street_address || ''} ${w.customer_city || ''} ${w.customer_state || ''}`.trim()}</TableCell>
                                  <TableCell>{w.internet_speed || 'N/A'}</TableCell>
                                  <TableCell>{installDateDisplay}</TableCell>
                                  <TableCell>{personalCommDisplay}</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
