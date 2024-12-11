'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import 'tailwindcss/tailwind.css';
import { Tab } from '@headlessui/react';
import { Button } from '@/components/button';
import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table';
import { Input } from '@/components/input';
import { Field, Label, Description } from '@/components/fieldset';
import { Select } from '@/components/select';
import { Checkbox, CheckboxField } from '@/components/checkbox';
import { BadgeButton } from '@/components/badge';

export default function PayrollApp() {
  const supabase = useMemo(() => createClient(), []);

  const [plans, setPlans] = useState([]);
  const [personalPayscales, setPersonalPayscales] = useState([]);
  const [managerPayscales, setManagerPayscales] = useState([]);
  const [agents, setAgents] = useState([]);
  const [agentManagers, setAgentManagers] = useState([]);

  const [loading, setLoading] = useState(false);

  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [newPlan, setNewPlan] = useState({ name: '', commission_amount: '' });

  const [newPersonalPayscale, setNewPersonalPayscale] = useState({
    name: '',
    commissions: {},
    upfront_percentage: '',
    backend_percentage: '',
  });
  const [isPersonalPayscaleModalOpen, setIsPersonalPayscaleModalOpen] = useState(false);

  const [newManagerPayscale, setNewManagerPayscale] = useState({ name: '', commissions: {} });
  const [isManagerPayscaleModalOpen, setIsManagerPayscaleModalOpen] = useState(false);

  const [isEditPlanModalOpen, setIsEditPlanModalOpen] = useState(false);
  const [editPlan, setEditPlan] = useState({ id: '', name: '', commission_amount: '' });

  const [isEditAgentModalOpen, setIsEditAgentModalOpen] = useState(false);
  const [editAgent, setEditAgent] = useState({
    id: '',
    identifier: '',
    name: '',
    is_manager: false,
    personal_payscale_id: '',
    manager_payscale_id: '',
    assignedAgents: [],
  });

  const [isEditPersonalPayscaleModalOpen, setIsEditPersonalPayscaleModalOpen] = useState(false);
  const [editPersonalPayscale, setEditPersonalPayscale] = useState({
    id: '',
    name: '',
    commissions: {},
    upfront_percentage: '',
    backend_percentage: ''
  });

  const [isEditManagerPayscaleModalOpen, setIsEditManagerPayscaleModalOpen] = useState(false);
  const [editManagerPayscale, setEditManagerPayscale] = useState({
    id: '',
    name: '',
    commissions: {}
  });

  const [isAddAgentModalOpen, setIsAddAgentModalOpen] = useState(false);
  const [newAgent, setNewAgent] = useState({
    name: '',
    identifier: '',
    is_manager: false,
    personal_payscale_id: '',
    manager_payscale_id: '',
  });

  const [editAgentSearch, setEditAgentSearch] = useState('');

  useEffect(() => {
    fetchAllData();
  }, []);

  async function fetchAllData() {
    setLoading(true);
    // Fetch plans first so that payscales can reference them correctly
    await fetchPlans();
    await fetchAgents();
    await fetchAgentManagers();
    await fetchPersonalPayscales();
    await fetchManagerPayscales();
    setLoading(false);
  }

  async function fetchPlans() {
    const { data } = await supabase.from('plans').select('*').order('id', { ascending: true });
    setPlans(data || []);
  }

  async function fetchPersonalPayscales() {
    const { data: payscales } = await supabase.from('personal_payscales').select('*').order('id', { ascending: true });
    const { data: commissions } = await supabase.from('personal_payscale_plan_commissions').select('*');
    setPersonalPayscales((payscales || []).map((p) => ({
      ...p,
      personal_payscale_plan_commissions: (commissions || [])
        .filter((c) => c.personal_payscale_id === p.id)
        .map((c) => ({
          ...c,
          plan_name: plans.find((pl) => pl.id === c.plan_id)?.name || 'Unknown',
        })),
    })));
  }

  async function fetchManagerPayscales() {
    const { data: payscales } = await supabase.from('manager_payscales').select('*').order('id', { ascending: true });
    const { data: commissions } = await supabase.from('manager_payscale_plan_commissions').select('*');
    setManagerPayscales((payscales || []).map((p) => ({
      ...p,
      manager_payscale_plan_commissions: (commissions || [])
        .filter((c) => c.manager_payscale_id === p.id)
        .map((c) => ({
          ...c,
          plan_name: plans.find((pl) => pl.id === c.plan_id)?.name || 'Unknown',
        })),
    })));
  }

  async function fetchAgents() {
    // Fetch agents in a stable order, for example by id
    const { data } = await supabase.from('agents').select('*').order('id', { ascending: true });
    setAgents(data || []);
  }

  async function fetchAgentManagers() {
    const { data } = await supabase.from('agent_managers').select('*');
    setAgentManagers(data || []);
  }

  function truncate(value, length = 50) {
    if (!value) return '';
    const str = value.toString();
    return str.length > length ? str.slice(0, length) + '...' : str;
  }

  function getAssignedAgentsForManager(managerId) {
    const assignedIds = agentManagers.filter((am) => am.manager_id === managerId).map((am) => am.agent_id);
    return agents.filter((a) => assignedIds.includes(a.id));
  }

  async function addPlan() {
    if (!newPlan.name || !newPlan.commission_amount || isNaN(parseFloat(newPlan.commission_amount))) return;
    await supabase.from('plans').insert([{ name: newPlan.name, commission_amount: parseFloat(newPlan.commission_amount) }]);
    await fetchPlans();
    setIsPlanModalOpen(false);
    setNewPlan({ name: '', commission_amount: '' });
  }

  async function addPersonalPayscale() {
    if (!newPersonalPayscale.name) return;
    const upfront = parseFloat(newPersonalPayscale.upfront_percentage);
    const backend = parseFloat(newPersonalPayscale.backend_percentage);
    if (isNaN(upfront) || isNaN(backend)) return;
    const commissionsArray = plans.map((p) => ({
      plan_id: p.id,
      rep_commission_type: 'fixed_amount',
      rep_commission_value: parseFloat(newPersonalPayscale.commissions[p.id] || '0'),
    }));
    const { data: pData } = await supabase
      .from('personal_payscales')
      .insert([{ name: newPersonalPayscale.name, upfront_percentage: upfront, backend_percentage: backend }])
      .select('*');
    if (!pData?.[0]) return;
    await supabase.from('personal_payscale_plan_commissions').insert(
      commissionsArray.map((c) => ({ ...c, personal_payscale_id: pData[0].id }))
    );
    await fetchPersonalPayscales();
    setIsPersonalPayscaleModalOpen(false);
    setNewPersonalPayscale({ name: '', commissions: {}, upfront_percentage: '', backend_percentage: '' });
  }

  async function addManagerPayscale() {
    if (!newManagerPayscale.name) return;
    const commissionsArray = plans.map((p) => ({
      plan_id: p.id,
      manager_commission_type: 'fixed_amount',
      manager_commission_value: parseFloat(newManagerPayscale.commissions[p.id] || '0'),
    }));
    const { data: mData } = await supabase
      .from('manager_payscales')
      .insert([{ name: newManagerPayscale.name }])
      .select('*');
    if (!mData?.[0]) return;
    await supabase.from('manager_payscale_plan_commissions').insert(
      commissionsArray.map((c) => ({ ...c, manager_payscale_id: mData[0].id }))
    );
    await fetchManagerPayscales();
    setIsManagerPayscaleModalOpen(false);
    setNewManagerPayscale({ name: '', commissions: {} });
  }

  function handlePersonalCommissionChange(planId, value) {
    setNewPersonalPayscale((prev) => ({ ...prev, commissions: { ...prev.commissions, [planId]: value } }));
  }

  function handleManagerCommissionChange(planId, value) {
    setNewManagerPayscale((prev) => ({ ...prev, commissions: { ...prev.commissions, [planId]: value } }));
  }

  function openEditPlanModal(plan) {
    setEditPlan({ id: plan.id, name: plan.name, commission_amount: plan.commission_amount });
    setIsEditPlanModalOpen(true);
  }

  async function updatePlan() {
    if (!editPlan.id || isNaN(parseFloat(editPlan.commission_amount))) return;
    await supabase
      .from('plans')
      .update({ commission_amount: parseFloat(editPlan.commission_amount) })
      .eq('id', editPlan.id);
    await fetchPlans();
    setIsEditPlanModalOpen(false);
    setEditPlan({ id: '', name: '', commission_amount: '' });
  }

  function openEditAgentModal(agent) {
    const assigned = agentManagers.filter((am) => am.manager_id === agent.id).map((am) => am.agent_id);
    setEditAgent({
      id: agent.id,
      identifier: agent.identifier,
      name: agent.name,
      is_manager: agent.is_manager,
      personal_payscale_id: agent.personal_payscale_id || '',
      manager_payscale_id: agent.manager_payscale_id || '',
      assignedAgents: assigned,
    });
    setEditAgentSearch('');
    setIsEditAgentModalOpen(true);
  }

  async function updateAgent() {
    if (!editAgent.id) return;
    await supabase.from('agents')
      .update({
        identifier: editAgent.identifier,
        name: editAgent.name,
        is_manager: editAgent.is_manager,
        personal_payscale_id: editAgent.personal_payscale_id || null,
        manager_payscale_id: editAgent.is_manager ? (editAgent.manager_payscale_id || null) : null
      })
      .eq('id', editAgent.id);

    // Re-assign agent managers
    await supabase.from('agent_managers').delete().eq('manager_id', editAgent.id);
    if (editAgent.is_manager && editAgent.assignedAgents.length > 0) {
      const relations = editAgent.assignedAgents.map((aId) => ({ agent_id: aId, manager_id: editAgent.id }));
      await supabase.from('agent_managers').insert(relations);
    }

    await fetchAgents();
    await fetchAgentManagers();
    setIsEditAgentModalOpen(false);
  }

  const assignableAgents = agents.filter((a) => a.id !== editAgent.id);
  const filteredAssignableAgents = editAgentSearch
    ? assignableAgents.filter((a) =>
        (a.name || a.identifier || '').toLowerCase().includes(editAgentSearch.toLowerCase())
      )
    : assignableAgents;

  function openEditPersonalPayscaleModal(p) {
    const commissionsObj = {};
    (p.personal_payscale_plan_commissions || []).forEach((c) => {
      commissionsObj[c.plan_id] = c.rep_commission_value;
    });
    setEditPersonalPayscale({
      id: p.id,
      name: p.name,
      upfront_percentage: p.upfront_percentage.toString(),
      backend_percentage: p.backend_percentage.toString(),
      commissions: commissionsObj
    });
    setIsEditPersonalPayscaleModalOpen(true);
  }

  async function updatePersonalPayscale() {
    if (!editPersonalPayscale.id) return;
    const upfront = parseFloat(editPersonalPayscale.upfront_percentage);
    const backend = parseFloat(editPersonalPayscale.backend_percentage);
    if (isNaN(upfront) || isNaN(backend)) return;
    await supabase.from('personal_payscales')
      .update({ name: editPersonalPayscale.name, upfront_percentage: upfront, backend_percentage: backend })
      .eq('id', editPersonalPayscale.id);

    await supabase.from('personal_payscale_plan_commissions').delete().eq('personal_payscale_id', editPersonalPayscale.id);
    const commissionsArray = plans.map((p) => ({
      personal_payscale_id: editPersonalPayscale.id,
      plan_id: p.id,
      rep_commission_type: 'fixed_amount',
      rep_commission_value: parseFloat(editPersonalPayscale.commissions[p.id] || '0'),
    }));
    await supabase.from('personal_payscale_plan_commissions').insert(commissionsArray);

    await fetchPersonalPayscales();
    setIsEditPersonalPayscaleModalOpen(false);
  }

  function openEditManagerPayscaleModal(p) {
    const commissionsObj = {};
    (p.manager_payscale_plan_commissions || []).forEach((c) => {
      commissionsObj[c.plan_id] = c.manager_commission_value;
    });
    setEditManagerPayscale({
      id: p.id,
      name: p.name,
      commissions: commissionsObj
    });
    setIsEditManagerPayscaleModalOpen(true);
  }

  async function updateManagerPayscale() {
    if (!editManagerPayscale.id) return;
    await supabase.from('manager_payscales')
      .update({ name: editManagerPayscale.name })
      .eq('id', editManagerPayscale.id);

    await supabase.from('manager_payscale_plan_commissions').delete().eq('manager_payscale_id', editManagerPayscale.id);
    const commissionsArray = plans.map((p) => ({
      manager_payscale_id: editManagerPayscale.id,
      plan_id: p.id,
      manager_commission_type: 'fixed_amount',
      manager_commission_value: parseFloat(editManagerPayscale.commissions[p.id] || '0'),
    }));
    await supabase.from('manager_payscale_plan_commissions').insert(commissionsArray);

    await fetchManagerPayscales();
    setIsEditManagerPayscaleModalOpen(false);
  }

  function handleEditPersonalCommissionChange(planId, value) {
    setEditPersonalPayscale((prev) => ({ ...prev, commissions: { ...prev.commissions, [planId]: value } }));
  }

  function handleEditManagerCommissionChange(planId, value) {
    setEditManagerPayscale((prev) => ({ ...prev, commissions: { ...prev.commissions, [planId]: value } }));
  }

  async function addAgent() {
    if (!newAgent.name || !newAgent.identifier) return;
    const { data: inserted } = await supabase.from('agents').insert([{
      name: newAgent.name,
      identifier: newAgent.identifier,
      is_manager: newAgent.is_manager,
      personal_payscale_id: newAgent.personal_payscale_id || null,
      manager_payscale_id: newAgent.is_manager ? (newAgent.manager_payscale_id || null) : null
    }]).select('*');

    if (inserted) {
      await fetchAgents();
      await fetchAgentManagers();
      setIsAddAgentModalOpen(false);
      setNewAgent({ name: '', identifier: '', is_manager: false, personal_payscale_id: '', manager_payscale_id: '' });
    }
  }

  if (loading) return <div className="container mx-auto p-4">Loading...</div>;

  return (
    <div className="container mx-auto p-4">
      <Tab.Group defaultIndex={0}>
        <Tab.List className="flex space-x-4 border-b mb-4">
          {['Users', 'Plans', 'Personal Payscales', 'Manager Payscales'].map((t, i) => (
            <Tab
              key={i}
              className={({ selected }) =>
                selected
                  ? 'px-4 py-2 font-semibold text-blue-500 border-b-2 border-blue-500'
                  : 'px-4 py-2 font-semibold text-gray-700 hover:text-blue-500'
              }
            >
              {t}
            </Tab>
          ))}
        </Tab.List>
        <Tab.Panels>
          {/* Users */}
          <Tab.Panel>
            <div className="mb-4 flex justify-between items-center">
              <h2 className="text-2xl font-bold">Users</h2>
              <Button onClick={() => setIsAddAgentModalOpen(true)}>Add User</Button>
            </div>
            <Table striped>
              <TableHead>
                <TableRow>
                  <TableHeader>Name</TableHeader>
                  <TableHeader>Identifier</TableHeader>
                  <TableHeader>Personal Payscale</TableHeader>
                  <TableHeader>Manager Payscale</TableHeader>
                  <TableHeader>Is Manager</TableHeader>
                  <TableHeader>Assigned Agents</TableHeader>
                  <TableHeader>Actions</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {agents.map((agent) => {
                  const personalName = agent.personal_payscale_id
                    ? personalPayscales.find((ps) => ps.id === agent.personal_payscale_id)?.name || 'N/A'
                    : 'N/A';
                  const managerName = agent.manager_payscale_id
                    ? managerPayscales.find((ms) => ms.id === agent.manager_payscale_id)?.name || 'N/A'
                    : 'N/A';
                  const assigned = getAssignedAgentsForManager(agent.id);
                  const assignedNames = assigned.map(a => a.name || a.identifier).join(', ') || 'N/A';

                  return (
                    <TableRow key={agent.id}>
                      <TableCell>{truncate(agent.name)}</TableCell>
                      <TableCell>{truncate(agent.identifier)}</TableCell>
                      <TableCell>{truncate(personalName)}</TableCell>
                      <TableCell>{agent.is_manager ? truncate(managerName) : 'N/A'}</TableCell>
                      <TableCell>{agent.is_manager ? 'Yes' : 'No'}</TableCell>
                      <TableCell>{truncate(assignedNames)}</TableCell>
                      <TableCell>
                        <Button size="sm" onClick={() => openEditAgentModal(agent)}>Edit</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Tab.Panel>

          {/* Plans */}
          <Tab.Panel>
            <div className="mb-4 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold">
                  MANAGE PLANS
                  </h2> 
              <span className='text-md text-gray-400'>(Plan name must match name in white glove data)</span>
              </div>
              <Button onClick={() => setIsPlanModalOpen(true)}>Add Plan</Button>
            </div>
            <Table striped>
              <TableHead>
                <TableRow>
                  <TableHeader>Plan Name</TableHeader>
                  <TableHeader>Commission Amount</TableHeader>
                  <TableHeader>Actions</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell>{truncate(plan.name)}</TableCell>
                    <TableCell>{truncate(`$${parseFloat(plan.commission_amount).toFixed(2)}`)}</TableCell>
                    <TableCell>
                      <Button size="sm" onClick={() => openEditPlanModal(plan)}>Edit</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Tab.Panel>

          {/* Personal Payscales */}
          <Tab.Panel>
            <div className="mb-4 flex justify-between items-center">
              <h2 className="text-2xl font-bold">Manage Personal Payscales</h2>
              <Button onClick={() => setIsPersonalPayscaleModalOpen(true)}>Add Personal Payscale</Button>
            </div>
            <Table striped>
              <TableHead>
                <TableRow>
                  <TableHeader>Payscale Name</TableHeader>
                  <TableHeader>Upfront (%)</TableHeader>
                  <TableHeader>Backend (%)</TableHeader>
                  <TableHeader>Summary</TableHeader>
                  <TableHeader>Actions</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {personalPayscales.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{truncate(p.name)}</TableCell>
                    <TableCell>{truncate(`${p.upfront_percentage}%`)}</TableCell>
                    <TableCell>{truncate(`${p.backend_percentage}%`)}</TableCell>
                    <TableCell>
                      {p.personal_payscale_plan_commissions?.map((c, i) => (
                        <div key={i}>{truncate(`${c.plan_name}: $${parseFloat(c.rep_commission_value).toFixed(2)}`)}</div>
                      )) || 'No commissions set.'}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" onClick={() => openEditPersonalPayscaleModal(p)}>Edit</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Tab.Panel>

          {/* Manager Payscales */}
          <Tab.Panel>
            <div className="mb-4 flex justify-between items-center">
              <h2 className="text-2xl font-bold">Manage Manager Payscales</h2>
              <Button onClick={() => setIsManagerPayscaleModalOpen(true)}>Add Manager Payscale</Button>
            </div>
            <Table striped>
              <TableHead>
                <TableRow>
                  <TableHeader>Payscale Name</TableHeader>
                  <TableHeader>Summary</TableHeader>
                  <TableHeader>Actions</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {managerPayscales.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{truncate(p.name)}</TableCell>
                    <TableCell>
                      {p.manager_payscale_plan_commissions?.map((c, i) => (
                        <div key={i}>{truncate(`${c.plan_name}: $${parseFloat(c.manager_commission_value).toFixed(2)}`)}</div>
                      )) || 'No commissions set.'}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" onClick={() => openEditManagerPayscaleModal(p)}>Edit</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Tab.Panel>
        </Tab.Panels>
      </Tab.Group>

      {/* Add Plan Modal */}
      <Dialog open={isPlanModalOpen} onClose={() => setIsPlanModalOpen(false)}>
        <DialogTitle>Add New Plan</DialogTitle>
        <div className='text-gray-400 text-md'>(Must match name in white glove data)</div>
        <DialogBody>
          <Field className="mb-4">
            <Label>Plan Name</Label>
            <Input type="text" value={newPlan.name} onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })} />
          </Field>
          <Field>
            <Label>Commission Amount</Label>
            <div className="flex items-center">
              <span className="mr-2">$</span>
              <Input
                type="number"
                value={newPlan.commission_amount}
                onChange={(e) => setNewPlan({ ...newPlan, commission_amount: e.target.value })}
              />
            </div>
          </Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setIsPlanModalOpen(false)}>Cancel</Button>
          <Button onClick={addPlan}>Add Plan</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Plan Modal */}
      <Dialog open={isEditPlanModalOpen} onClose={() => setIsEditPlanModalOpen(false)}>
        <DialogTitle>Edit Plan</DialogTitle>
        <DialogBody>
          <Field className="mb-4">
            <Label>Plan Name</Label>
            <Input type="text" value={editPlan.name} disabled className="bg-gray-100 cursor-not-allowed" />
          </Field>
          <Field>
            <Label>Commission Amount</Label>
            <div className="flex items-center">
              <span className="mr-2">$</span>
              <Input
                type="number"
                value={editPlan.commission_amount}
                onChange={(e) => setEditPlan({ ...editPlan, commission_amount: e.target.value })}
              />
            </div>
          </Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setIsEditPlanModalOpen(false)}>Cancel</Button>
          <Button onClick={updatePlan}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Add Personal Payscale Modal */}
      <Dialog open={isPersonalPayscaleModalOpen} onClose={() => setIsPersonalPayscaleModalOpen(false)} size="xl">
        <DialogTitle>Add New Personal Payscale</DialogTitle>
        <DialogBody>
          <Field className="mb-4">
            <Label>Payscale Name</Label>
            <Input
              type="text"
              value={newPersonalPayscale.name}
              onChange={(e) => setNewPersonalPayscale({ ...newPersonalPayscale, name: e.target.value })}
            />
          </Field>
          <div className="mb-4 flex space-x-4">
            <Field className="w-1/2">
              <Label>Upfront (%)</Label>
              <Input
                type="number"
                value={newPersonalPayscale.upfront_percentage}
                onChange={(e) => setNewPersonalPayscale({ ...newPersonalPayscale, upfront_percentage: e.target.value })}
              />
            </Field>
            <Field className="w-1/2">
              <Label>Backend (%)</Label>
              <Input
                type="number"
                value={newPersonalPayscale.backend_percentage}
                onChange={(e) => setNewPersonalPayscale({ ...newPersonalPayscale, backend_percentage: e.target.value })}
              />
            </Field>
          </div>
          <h3 className="font-semibold mb-2">Commission Values</h3>
          {plans.map((p) => (
            <Field key={p.id} className="mb-2 flex items-center">
              <div className="w-1/2">{p.name}</div>
              <div className="w-1/2 flex">
                <span className="mr-2">$</span>
                <Input
                  type="number"
                  value={newPersonalPayscale.commissions[p.id] || ''}
                  onChange={(e) => handlePersonalCommissionChange(p.id, e.target.value)}
                />
              </div>
            </Field>
          ))}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setIsPersonalPayscaleModalOpen(false)}>Cancel</Button>
          <Button onClick={addPersonalPayscale}>Add Payscale</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Personal Payscale Modal */}
      <Dialog open={isEditPersonalPayscaleModalOpen} onClose={() => setIsEditPersonalPayscaleModalOpen(false)} size="xl">
        <DialogTitle>Edit Personal Payscale</DialogTitle>
        <DialogBody>
          <Field className="mb-4">
            <Label>Payscale Name</Label>
            <Input
              type="text"
              value={editPersonalPayscale.name}
              onChange={(e) => setEditPersonalPayscale({ ...editPersonalPayscale, name: e.target.value })}
            />
          </Field>
          <div className="mb-4 flex space-x-4">
            <Field className="w-1/2">
              <Label>Upfront (%)</Label>
              <Input
                type="number"
                value={editPersonalPayscale.upfront_percentage}
                onChange={(e) => setEditPersonalPayscale({ ...editPersonalPayscale, upfront_percentage: e.target.value })}
              />
            </Field>
            <Field className="w-1/2">
              <Label>Backend (%)</Label>
              <Input
                type="number"
                value={editPersonalPayscale.backend_percentage}
                onChange={(e) => setEditPersonalPayscale({ ...editPersonalPayscale, backend_percentage: e.target.value })}
              />
            </Field>
          </div>
          <h3 className="font-semibold mb-2">Commission Values</h3>
          {plans.map((p) => (
            <Field key={p.id} className="mb-2 flex items-center">
              <div className="w-1/2">{p.name}</div>
              <div className="w-1/2 flex">
                <span className="mr-2">$</span>
                <Input
                  type="number"
                  value={editPersonalPayscale.commissions[p.id] || ''}
                  onChange={(e) => handleEditPersonalCommissionChange(p.id, e.target.value)}
                />
              </div>
            </Field>
          ))}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setIsEditPersonalPayscaleModalOpen(false)}>Cancel</Button>
          <Button onClick={updatePersonalPayscale}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Add Manager Payscale Modal */}
      <Dialog open={isManagerPayscaleModalOpen} onClose={() => setIsManagerPayscaleModalOpen(false)} size="xl">
        <DialogTitle>Add New Manager Payscale</DialogTitle>
        <DialogBody>
          <Field className="mb-4">
            <Label>Payscale Name</Label>
            <Input
              type="text"
              value={newManagerPayscale.name}
              onChange={(e) => setNewManagerPayscale({ ...newManagerPayscale, name: e.target.value })}
            />
          </Field>
          <h3 className="font-semibold mb-2">Commission Values</h3>
          {plans.map((p) => (
            <Field key={p.id} className="mb-2 flex items-center">
              <div className="w-1/2">{p.name}</div>
              <div className="w-1/2 flex">
                <span className="mr-2">$</span>
                <Input
                  type="number"
                  value={newManagerPayscale.commissions[p.id] || ''}
                  onChange={(e) => handleManagerCommissionChange(p.id, e.target.value)}
                />
              </div>
            </Field>
          ))}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setIsManagerPayscaleModalOpen(false)}>Cancel</Button>
          <Button onClick={addManagerPayscale}>Add Payscale</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Manager Payscale Modal */}
      <Dialog open={isEditManagerPayscaleModalOpen} onClose={() => setIsEditManagerPayscaleModalOpen(false)} size="xl">
        <DialogTitle>Edit Manager Payscale</DialogTitle>
        <DialogBody>
          <Field className="mb-4">
            <Label>Payscale Name</Label>
            <Input
              type="text"
              value={editManagerPayscale.name}
              onChange={(e) => setEditManagerPayscale({ ...editManagerPayscale, name: e.target.value })}
            />
          </Field>
          <h3 className="font-semibold mb-2">Commission Values</h3>
          {plans.map((p) => (
            <Field key={p.id} className="mb-2 flex items-center">
              <div className="w-1/2">{p.name}</div>
              <div className="w-1/2 flex">
                <span className="mr-2">$</span>
                <Input
                  type="number"
                  value={editManagerPayscale.commissions[p.id] || ''}
                  onChange={(e) => handleEditManagerCommissionChange(p.id, e.target.value)}
                />
              </div>
            </Field>
          ))}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setIsEditManagerPayscaleModalOpen(false)}>Cancel</Button>
          <Button onClick={updateManagerPayscale}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Add Agent Modal */}
      <Dialog open={isAddAgentModalOpen} onClose={() => setIsAddAgentModalOpen(false)} size="xl">
        <DialogTitle>Add User</DialogTitle>
        <DialogBody>
          <Field className="mb-4">
            <Label>Name</Label>
            <Input type="text" value={newAgent.name} onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })} />
          </Field>
          <Field className="mb-4">
            <Label>Identifier</Label>
            <Input type="text" value={newAgent.identifier} onChange={(e) => setNewAgent({ ...newAgent, identifier: e.target.value })} />
          </Field>
          <CheckboxField className="mb-4">
            <Checkbox
              checked={newAgent.is_manager}
              onChange={(val) => setNewAgent({ ...newAgent, is_manager: val })}
            />
            <Label>Is Manager?</Label>
          </CheckboxField>
          <Field className="mb-4">
            <Label>Personal Payscale</Label>
            <Select
              name="personal_payscale_id"
              value={newAgent.personal_payscale_id}
              onChange={(e) => setNewAgent({ ...newAgent, personal_payscale_id: e.target.value })}
            >
              <option value="">Select Personal Payscale</option>
              {personalPayscales.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          {newAgent.is_manager && (
            <Field className="mb-4">
              <Label>Manager Payscale</Label>
              <Select
                name="manager_payscale_id"
                value={newAgent.manager_payscale_id}
                onChange={(e) => setNewAgent({ ...newAgent, manager_payscale_id: e.target.value })}
              >
                <option value="">Select Manager Payscale</option>
                {managerPayscales.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
          )}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setIsAddAgentModalOpen(false)}>Cancel</Button>
          <Button onClick={addAgent}>Add User</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Agent Modal */}
      <Dialog open={isEditAgentModalOpen} onClose={() => setIsEditAgentModalOpen(false)} size="xl">
        <DialogTitle>Edit User</DialogTitle>
        <DialogBody>
          <Field className="mb-4">
            <Label>Name</Label>
            <Input type="text" value={editAgent.name} onChange={(e) => setEditAgent({ ...editAgent, name: e.target.value })} />
          </Field>
          <Field className="mb-4">
            <Label>Identifier</Label>
            <Input type="text" value={editAgent.identifier} onChange={(e) => setEditAgent({ ...editAgent, identifier: e.target.value })} />
          </Field>

          <CheckboxField className="mb-4">
            <Checkbox
              checked={editAgent.is_manager}
              onChange={(val) => setEditAgent({ ...editAgent, is_manager: val })}
            />
            <Label>Is Manager?</Label>
          </CheckboxField>

          <Field className="mb-4">
            <Label>Personal Payscale</Label>
            <Select
              name="personal_payscale_id"
              value={editAgent.personal_payscale_id}
              onChange={(e) => setEditAgent({ ...editAgent, personal_payscale_id: e.target.value })}
            >
              <option value="">Select Personal Payscale</option>
              {personalPayscales.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>

          {editAgent.is_manager && (
            <>
              <Field className="mb-4">
                <Label>Manager Payscale</Label>
                <Select
                  name="manager_payscale_id"
                  value={editAgent.manager_payscale_id}
                  onChange={(e) => setEditAgent({ ...editAgent, manager_payscale_id: e.target.value })}
                >
                  <option value="">Select Manager Payscale</option>
                  {managerPayscales.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </Field>
              <Field className="mb-4">
                <Label>Assign Agents</Label>
                <Description>Search for agents and click to add them as assigned.</Description>
                <Input
                  type="text"
                  placeholder="Search agents..."
                  value={editAgentSearch}
                  onChange={(e) => setEditAgentSearch(e.target.value)}
                  className="mb-2"
                />
                <div className="flex flex-wrap gap-2 mb-2">
                  {editAgent.assignedAgents.map((aId) => {
                    const a = agents.find((x) => x.id === aId);
                    return (
                      <BadgeButton
                        key={aId}
                        color="blue"
                        onClick={() => {
                          setEditAgent((prev) => ({
                            ...prev,
                            assignedAgents: prev.assignedAgents.filter((id) => id !== aId),
                          }));
                        }}
                      >
                        {a?.name || a?.identifier} ×
                      </BadgeButton>
                    );
                  })}
                </div>
                {filteredAssignableAgents.length > 0 && (
                  <div className="border p-2 rounded max-h-48 overflow-auto">
                    {filteredAssignableAgents.map((a) => (
                      <div
                        key={a.id}
                        className="cursor-pointer hover:bg-gray-100 p-1"
                        onClick={() => {
                          if (!editAgent.assignedAgents.includes(a.id)) {
                            setEditAgent((prev) => ({
                              ...prev,
                              assignedAgents: [...prev.assignedAgents, a.id],
                            }));
                          }
                        }}
                      >
                        {a.name || a.identifier}
                      </div>
                    ))}
                  </div>
                )}
              </Field>
            </>
          )}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setIsEditAgentModalOpen(false)}>Cancel</Button>
          <Button onClick={updateAgent}>Save</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
