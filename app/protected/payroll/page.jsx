'use client';

import React, { useState, useMemo, useRef } from 'react';
import Papa from 'papaparse';
import { Button } from '@/components/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/table';
import { Input } from '@/components/input';
import { createClient } from '@/utils/supabase/client';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/20/solid';

export default function PayrollTab() {
  const supabase = useMemo(() => createClient(), []);
  const [file1, setFile1] = useState(null);
  const [file2, setFile2] = useState(null);
  const [report, setReport] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedAgents, setExpandedAgents] = useState(new Set());
  const [reportDetails, setReportDetails] = useState({});
  const [batchName, setBatchName] = useState('');

  const file1Ref = useRef(null);
  const file2Ref = useRef(null);

  const handleFile1Click = () => file1Ref.current.click();
  const handleFile2Click = () => file2Ref.current.click();

  const parseFiles = () => {
    if (!file1 || !file2) {
      alert('Please select both files.');
      return;
    }
    setLoading(true);
    Papa.parse(file1, {
      header: true,
      complete: (res1) => {
        Papa.parse(file2, {
          header: true,
          complete: async (res2) => {
            try {
              const data1 = res1.data;
              const data2 = res2.data;
              await upsertPlansFromCSV(data1, data2);

              const orderMap = {};
              data2.forEach((row) => {
                if (row['Order Number']) {
                  orderMap[row['Order Number']] = row;
                }
              });
              const matched = data1
                .filter((row) => row['Order Id'] && orderMap[row['Order Id']])
                .map((row) => ({
                  ...row,
                  matchedWhiteGlove: orderMap[row['Order Id']],
                }));

              await upsertAgentsFromMatches(matched);
              await generateReport(matched);
              setLoading(false);
            } catch (err) {
              console.error(err);
              alert('Error processing files.');
              setLoading(false);
            }
          },
        });
      },
    });
  };

  async function upsertPlansFromCSV(csv1Rows, csv2Rows) {
    // Plans might appear in the "White Glove" data or the "New installs" data
    const csv1PlanMap = {};
    for (const row of csv1Rows) {
      const planName = row['Plan Name']?.trim();
      let payoutStr = row['Payout'];
      if (planName && payoutStr) {
        payoutStr = payoutStr.replace('$', '').replace(',', '');
        const payoutVal = parseFloat(payoutStr);
        if (!isNaN(payoutVal) && csv1PlanMap[planName] === undefined) {
          csv1PlanMap[planName] = payoutVal;
        }
      }
    }

    // Also gather distinct plan names from second CSV if needed
    const planSet = new Set();
    for (const row of csv2Rows) {
      const speed = row['Internet Speed']?.trim();
      if (speed) planSet.add(speed);
    }

    for (const planName of planSet) {
      const commission_amount = csv1PlanMap[planName] !== undefined ? csv1PlanMap[planName] : 0;
      await supabase
        .from('plans')
        .upsert([{ name: planName, commission_amount }], { onConflict: 'name' });
    }
  }

  async function upsertAgentsFromMatches(matchedRows) {
    const agentsMap = {};
    for (const row of matchedRows) {
      const wg = row.matchedWhiteGlove;
      const agentInfo = wg['Agent Seller Information']?.trim();
      if (agentInfo && agentsMap[agentInfo] === undefined) {
        // Attempt to parse name from something like "Rep: John Smith" => name is "John Smith"
        const colonIndex = agentInfo.indexOf(':');
        const agentName = colonIndex >= 0 ? agentInfo.substring(colonIndex + 1).trim() : agentInfo;
        agentsMap[agentInfo] = agentName;
      }
    }
    const entries = Object.entries(agentsMap).map(([identifier, name]) => ({
      identifier,
      name,
    }));
    for (const e of entries) {
      await supabase.from('agents').upsert([e], { onConflict: 'identifier' });
    }
  }

  async function insertNewWhiteGloveEntries(matchedRows) {
    const entries = matchedRows.map((r) => {
      const wg = r.matchedWhiteGlove;
      const data1Row = r;
      const installDateStr = data1Row['Day Of'];
      const install_date = installDateStr ? new Date(installDateStr) : null;

      return {
        customer_name: wg['Customer Name'] || null,
        customer_street_address: wg['Customer Street Address'] || null,
        customer_city: wg['Customer City (Zipcode as of 7/26/2024)'] || null,
        customer_state: wg['Customer State'] || null,
        ban: wg['BAN'] || null,
        order_number: wg['Order Number'] || null,
        order_status: wg['Order Status'] || null,
        order_submission_date: wg['Order Submission Date']
          ? new Date(wg['Order Submission Date'])
          : null,
        original_due_date: wg['Original Due Date'] ? new Date(wg['Original Due Date']) : null,
        updated_due_date: wg['Updated Due Date'] ? new Date(wg['Updated Due Date']) : null,
        order_completed_cancelled: wg['Order Completed/Cancelled'] || null,
        customer_cbr: wg['Customer CBR'] || null,
        partner_name: wg['Partner Name'] || null,
        partner_sales_code: wg['Partner Sales Code'] || null,
        audit_status: wg['Audit Status'] || null,
        audit_closed: wg['Audit Closed no longer on form as of 11/22/2024'] || null,
        who_cancelled_the_order: wg['Who Cancelled the Order'] || null,
        did_you_intervene_on_the_order: wg['Did you intervene on the order'] || null,
        notes: wg['Notes'] || null,
        item_type: wg['Item Type'] || null,
        path: wg['Path'] || null,
        due_date_helper: wg['Due Date Helper'] || null,
        migrating_from_legacy:
          wg[
            'Is the customer Migrating from Legacy Services? (7/26/2024 DSL means yes blank field means No)'
          ] || null,
        legacy_or_brspd_fiber: wg['Legacy or BRSPD Fiber?'] || null,
        cancellation_reason: wg['Cancellation Reason'] || null,
        voice_qty: wg['Voice_Qty'] ? parseInt(wg['Voice_Qty'], 10) : null,
        hsi_qty: wg['HSI_Qty'] ? parseInt(wg['HSI_Qty'], 10) : null,
        internet_speed: wg['Internet Speed'] || null,
        agent_seller_information: wg['Agent Seller Information'] || null,
        modified_due_date: wg['Modified Due Date'] ? new Date(wg['Modified Due Date']) : null,
        modified_month: wg['Modified Month'] ? parseInt(wg['Modified Month'], 10) : null,
        month_issued: wg['Month Issued'] ? parseInt(wg['Month Issued'], 10) : null,
        year_issued: wg['Year Issued'] ? parseInt(wg['Year Issued'], 10) : null,
        month_completed: wg['Month Completed'] ? parseInt(wg['Month Completed'], 10) : null,
        year_completed: wg['Year Completed'] ? parseInt(wg['Year Completed'], 10) : null,
        month_due: wg['Month Due'] ? parseInt(wg['Month Due'], 10) : null,
        year_due: wg['Year Due'] ? parseInt(wg['Year Due'], 10) : null,
        install_date,
        frontend_paid: false,
        backend_paid: false,
      };
    });

    await supabase
      .from('white_glove_entries')
      .upsert(entries, { onConflict: 'order_number' });
  }

  async function generateReport(matchedRows) {
    const { data: agents } = await supabase.from('agents').select('*');
    const { data: agentManagers } = await supabase.from('agent_managers').select('*');
    const { data: plans } = await supabase.from('plans').select('*');
    const { data: personalPayscalePlanCommissions } = await supabase
      .from('personal_payscale_plan_commissions')
      .select('*');
    const { data: managerPayscalePlanCommissions } = await supabase
      .from('manager_payscale_plan_commissions')
      .select('*');
    const { data: personalPayscales } = await supabase.from('personal_payscales').select('*');
    const { data: managerPayscales } = await supabase.from('manager_payscales').select('*');

    // NEW: fetch manager-agent overrides
    const { data: managerAgentCommissions } = await supabase
      .from('manager_agent_commissions')
      .select('*');

    // Build a quick map for manager-agent overrides: managerAgentCommissionMap[mgrId][agentId][planId]
    const managerAgentCommissionMap = {};
    (managerAgentCommissions || []).forEach(mac => {
      if (!managerAgentCommissionMap[mac.manager_id]) {
        managerAgentCommissionMap[mac.manager_id] = {};
      }
      if (!managerAgentCommissionMap[mac.manager_id][mac.agent_id]) {
        managerAgentCommissionMap[mac.manager_id][mac.agent_id] = {};
      }
      managerAgentCommissionMap[mac.manager_id][mac.agent_id][mac.plan_id] = mac.manager_commission_value;
    });

    const agentsByIdentifier = {};
    (agents || []).forEach((a) => {
      agentsByIdentifier[a.identifier] = a;
    });

    const plansByName = {};
    (plans || []).forEach((p) => {
      plansByName[p.name] = p;
    });

    const personalCommissionMap = {};
    (personalPayscalePlanCommissions || []).forEach((c) => {
      if (!personalCommissionMap[c.personal_payscale_id]) {
        personalCommissionMap[c.personal_payscale_id] = {};
      }
      personalCommissionMap[c.personal_payscale_id][c.plan_id] = c.rep_commission_value;
    });

    const managerCommissionMap = {};
    (managerPayscalePlanCommissions || []).forEach((c) => {
      if (!managerCommissionMap[c.manager_payscale_id]) {
        managerCommissionMap[c.manager_payscale_id] = {};
      }
      managerCommissionMap[c.manager_payscale_id][c.plan_id] = c.manager_commission_value;
    });

    const agentById = {};
    (agents || []).forEach((a) => {
      agentById[a.id] = a;
    });

    const managerForAgent = {};
    (agentManagers || []).forEach((am) => {
      managerForAgent[am.agent_id] = am.manager_id;
    });

    const personalPayscalesById = {};
    (personalPayscales || []).forEach((p) => {
      personalPayscalesById[p.id] = p;
    });

    // Insert new WGE entries if not existing
    await insertNewWhiteGloveEntries(matchedRows);

    // Then fetch them back
    const orderNumbers = matchedRows.map((m) => m.matchedWhiteGlove['Order Number']).filter(Boolean);
    const { data: wgeData } = await supabase
      .from('white_glove_entries')
      .select('*')
      .in('order_number', orderNumbers);

    const wgeByOrder = {};
    (wgeData || []).forEach((w) => {
      wgeByOrder[w.order_number] = w;
    });

    // Build up totals for each agent
    const totals = {};
    (agents || []).forEach((a) => {
      let up = null,
        bp = null;
      if (a.personal_payscale_id && personalPayscalesById[a.personal_payscale_id]) {
        up = parseFloat(personalPayscalesById[a.personal_payscale_id].upfront_percentage);
        bp = parseFloat(personalPayscalesById[a.personal_payscale_id].backend_percentage);
      }
      totals[a.id] = {
        name: a.name || a.identifier,
        accounts: 0,
        personalTotal: 0,
        managerTotal: 0,
        upfront_percentage: isNaN(up) ? null : up,
        backend_percentage: isNaN(bp) ? null : bp,
        details: [],
      };
    });

    for (const row of matchedRows) {
      const wg = row.matchedWhiteGlove;
      const agentInfo = wg['Agent Seller Information']?.trim();
      const internetSpeed = wg['Internet Speed']?.trim();
      if (!agentInfo || !internetSpeed || !agentsByIdentifier[agentInfo] || !plansByName[internetSpeed]) {
        continue;
      }

      const agent = agentsByIdentifier[agentInfo];
      const plan = plansByName[internetSpeed];
      let personalVal = 0;
      let managerVal = 0;

      // personal pay
      if (
        agent.personal_payscale_id &&
        personalCommissionMap[agent.personal_payscale_id] &&
        personalCommissionMap[agent.personal_payscale_id][plan.id] !== undefined
      ) {
        totals[agent.id].accounts += 1;
        personalVal = personalCommissionMap[agent.personal_payscale_id][plan.id] || 0;
        totals[agent.id].personalTotal += personalVal;
      }

      // manager pay
      const mgrId = managerForAgent[agent.id];
      if (mgrId && agentById[mgrId] && agentById[mgrId].manager_payscale_id) {
        // Check overrides first
        if (
          managerAgentCommissionMap[mgrId] &&
          managerAgentCommissionMap[mgrId][agent.id] &&
          managerAgentCommissionMap[mgrId][agent.id][plan.id] !== undefined
        ) {
          // If there's an override for manager->thisAgent->thisPlan
          managerVal = managerAgentCommissionMap[mgrId][agent.id][plan.id];
        } else {
          // Fall back to standard manager payscale
          const managerPsId = agentById[mgrId].manager_payscale_id;
          if (
            managerPsId &&
            managerCommissionMap[managerPsId] &&
            managerCommissionMap[managerPsId][plan.id] !== undefined
          ) {
            managerVal = managerCommissionMap[managerPsId][plan.id] || 0;
          }
        }
        totals[mgrId].managerTotal += managerVal;
      }

      const orderNum = wg['Order Number'];
      const wgeRow = wgeByOrder[orderNum] || {};

      // We'll store white_glove_entry_id for details
      const detailEntry = {
        white_glove_entry_id: wgeRow.id,
        personal_commission: personalVal,
      };
      totals[agent.id].details.push(detailEntry);
    }

    // Build final report
    const filteredReport = Object.entries(totals)
      .filter(([agentId, data]) => data.accounts > 0)
      .map(([agentId, data]) => {
        const personalTotal = data.personalTotal || 0;
        const managerTotal = data.managerTotal || 0;
        const grandTotal = personalTotal + managerTotal; // computed but not displayed in final UI
        let upfrontValue = null;
        if (data.upfront_percentage !== null && !isNaN(data.upfront_percentage)) {
          upfrontValue = personalTotal * (data.upfront_percentage / 100);
        }
        let backendValue = null;
        if (data.backend_percentage !== null && !isNaN(data.backend_percentage)) {
          backendValue = personalTotal * (data.backend_percentage / 100);
        }
        return {
          agentId,
          name: data.name,
          accounts: data.accounts,
          personalTotal,
          managerTotal,
          grandTotal,
          upfront_percentage: data.upfront_percentage,
          backend_percentage: data.backend_percentage,
          upfrontValue,
          backendValue,
          details: data.details,
        };
      });

    const detailMap = {};
    for (const line of filteredReport) {
      detailMap[line.agentId] = line.details;
    }

    setReport(filteredReport);
    setReportDetails(detailMap);
  }

  const toggleExpand = (agentId) => {
    setExpandedAgents((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(agentId)) newSet.delete(agentId);
      else newSet.add(agentId);
      return newSet;
    });
  };

  const saveReport = async () => {
    if (report.length === 0) return;
    if (!batchName.trim()) {
      alert('Please provide a batch name');
      return;
    }

    const { data: batchData, error: batchError } = await supabase
      .from('payroll_report_batches')
      .insert([{ batch_name: batchName }])
      .select('*')
      .single();

    if (batchError) {
      console.error('Error creating batch:', batchError);
      alert('Error creating batch');
      return;
    }

    const batch_id = batchData.id;

    const rows = report.map((r) => ({
      agent_id: r.agentId,
      name: r.name,
      accounts: r.accounts,
      personal_total: r.personalTotal,
      manager_total: r.managerTotal,
      grand_total: r.grandTotal,
      upfront_percentage: r.upfront_percentage,
      backend_percentage: r.backend_percentage,
      upfront_value: r.upfrontValue,
      backend_value: r.backendValue,
      batch_id,
      frontend_is_paid: false,
      backend_is_paid: false,
      details: r.details,
    }));

    const { error } = await supabase.from('payroll_reports').insert(rows);
    if (error) {
      console.error('Error saving report:', error);
      alert('Error saving report');
    } else {
      alert('Report saved successfully!');
      setBatchName('');
    }
  };

  const showGenerateReport = file1 && file2 && report.length === 0;

  return (
    <div className="p-6 space-y-6 font-sans text-gray-900">
      <h2 className="text-2xl font-bold">Payroll Report Generator (Upload as CSV files)</h2>
      <input
        type="file"
        ref={file1Ref}
        className="hidden"
        onChange={(e) => setFile1(e.target.files[0])}
      />
      <input
        type="file"
        ref={file2Ref}
        className="hidden"
        onChange={(e) => setFile2(e.target.files[0])}
      />
      <div className="flex items-center space-x-4">
        <Button onClick={handleFile1Click}>New installs</Button>
        {file1 && <span className="text-sm text-gray-600">{file1.name}</span>}

        <Button onClick={handleFile2Click}>White glove</Button>
        {file2 && <span className="text-sm text-gray-600">{file2.name}</span>}
      </div>

      {showGenerateReport && (
        <Button onClick={parseFiles} disabled={loading}>
          {loading ? 'Processing...' : 'Generate Report'}
        </Button>
      )}

      {report.length > 0 && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-col space-y-2 sm:flex-row sm:items-center sm:space-x-4 sm:space-y-0">
            <h3 className="text-lg font-bold">Payroll Report</h3>
            <div className="flex items-center space-x-2">
              <Input
                placeholder="Batch Name"
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
              />
              <Button onClick={saveReport}>Save Report</Button>
            </div>
          </div>
          <Table striped>
            <TableHead>
              <TableRow>
                <TableHeader></TableHeader>
                <TableHeader>Name</TableHeader>
                <TableHeader># Accounts</TableHeader>
                <TableHeader>Personal Total</TableHeader>
                <TableHeader>Manager Total</TableHeader>
                {/* Grand total not displayed in UI */}
                <TableHeader>Upfront</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {report.map((r) => {
                const personalTotalDisplay =
                  typeof r.personalTotal === 'number' ? `$${r.personalTotal.toFixed(2)}` : 'N/A';
                const managerTotalDisplay =
                  typeof r.managerTotal === 'number' && r.managerTotal > 0
                    ? `$${r.managerTotal.toFixed(2)}`
                    : 'N/A';
                const upfrontDisplay =
                  r.upfrontValue !== null && !isNaN(r.upfrontValue)
                    ? `$${r.upfrontValue.toFixed(2)} (${r.upfront_percentage}%)`
                    : 'N/A';
                const isExpanded = expandedAgents.has(r.agentId);

                return (
                  <React.Fragment key={r.agentId}>
                    <TableRow>
                      <TableCell>
                        <Button size="sm" variant="plain" onClick={() => toggleExpand(r.agentId)}>
                          {isExpanded ? (
                            <ChevronUpIcon className="h-5 w-5" />
                          ) : (
                            <ChevronDownIcon className="h-5 w-5" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell>{r.accounts}</TableCell>
                      <TableCell>{personalTotalDisplay}</TableCell>
                      <TableCell>{managerTotalDisplay}</TableCell>
                      <TableCell>{upfrontDisplay}</TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-gray-50">
                          <div className="p-4">
                            <h4 className="font-bold mb-2">Sales Details</h4>
                            <Table striped>
                              <TableHead>
                                <TableRow>
                                  <TableHeader>White Glove Entry ID</TableHeader>
                                  <TableHeader>Personal Commission</TableHeader>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {reportDetails[r.agentId]?.map((d, idx) => {
                                  const personalCommDisplay = `$${(
                                    d.personal_commission || 0
                                  ).toFixed(2)}`;
                                  return (
                                    <TableRow key={idx}>
                                      <TableCell>{d.white_glove_entry_id}</TableCell>
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
      )}
    </div>
  );
}
