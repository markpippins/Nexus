import React, { useState, useEffect } from 'react';
import { Service, Server, Deployment, System, Environment } from '../../types';
import { registryApi } from '../../lib/api';
import { X, Save, Layers, Server as ServerIcon, Plus, Link } from 'lucide-react';

interface EntityModalProps {
  isOpen: boolean;
  onClose: () => void;
  modalType: 'service' | 'server' | 'deployment' | 'system' | 'link-service' | 'register-service';
  editingData?: any;
  systemsList: System[];
  servicesList: Service[];
  serversList: Server[];
  onSuccess: () => void;
}

export const EntityModal: React.FC<EntityModalProps> = ({
  isOpen,
  onClose,
  modalType,
  editingData,
  systemsList,
  servicesList,
  serversList,
  onSuccess
}) => {
  const [formData, setFormData] = useState<any>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editingData) {
      setFormData(editingData);
    } else {
      // Default empty form state
      setFormData({
        name: '',
        type: 'Microservice',
        version: '1.0.0',
        status: 'healthy',
        environment: 'production',
        systemId: systemsList[0]?.id || 'sys-01',
        systemName: systemsList[0]?.name || 'Payments & Financial Core',
        serverId: serversList[0]?.id || 'srv-01',
        serviceName: servicesList[0]?.name || 'auth-gateway-svc',
        endpoint: 'https://api.platform.example.com/v1',
        hostname: 'k8s-node-01.infra.internal',
        ipAddress: '10.128.0.10',
        serverType: 'c6i.2xlarge Compute Optimized',
        operatingSystem: 'Ubuntu 22.04 LTS',
        datacenterRegion: 'us-east-1 (N. Virginia)',
        owner: 'Platform Engineering',
        description: 'Operational system domain platform',
        tier: 'Tier 1 - Critical',
        replicasTarget: 4,
        commitHash: 'a1b2c3d',
        clusterName: 'us-east-prod-k8s'
      });
    }
    setError(null);
  }, [editingData, modalType, isOpen]);

  if (!isOpen) return null;

  const handleChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (modalType === 'service') {
        const sys = systemsList.find(s => s.id === formData.systemId || s.name === formData.systemName);
        const payload = {
          ...formData,
          systemName: sys?.name || formData.systemName
        };

        if (editingData?.id) {
          await registryApi.updateService(editingData.id, payload);
        } else {
          await registryApi.createService(payload);
        }
      } else if (modalType === 'register-service') {
        await registryApi.registerService({
          name: formData.name,
          endpoint: formData.endpoint,
          version: formData.version,
          systemName: formData.systemName,
          environment: formData.environment
        });
      } else if (modalType === 'server') {
        if (editingData?.id) {
          await registryApi.updateServer(editingData.id, formData);
        } else {
          await registryApi.createServer(formData);
        }
      } else if (modalType === 'deployment') {
        if (editingData?.id) {
          await registryApi.updateDeployment(editingData.id, formData);
        } else {
          await registryApi.createDeployment(formData);
        }
      } else if (modalType === 'system') {
        if (editingData?.id) {
          await registryApi.updateSystem(editingData.id, formData);
        } else {
          await registryApi.createSystem(formData);
        }
      } else if (modalType === 'link-service') {
        await registryApi.linkServiceToSystem(formData.systemName, formData.serviceName);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 shadow-2xl space-y-4">
        
        {/* Modal Title */}
        <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
          <h3 className="text-base font-bold text-[var(--text-primary)] capitalize flex items-center gap-2">
            <Layers className="h-5 w-5 text-sky-400" />
            <span>
              {editingData ? `Edit ${modalType}` : modalType === 'link-service' ? 'Link Service to System' : `New ${modalType}`}
            </span>
          </h3>

          <button
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-400 font-mono">
            {error}
          </div>
        )}

        {/* Dynamic Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          
          {/* SERVICE / REGISTER SERVICE FORM */}
          {(modalType === 'service' || modalType === 'register-service') && (
            <div className="space-y-3">
              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Service Name</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="e.g. auth-gateway-svc"
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] p-2.5 font-mono text-[var(--text-primary)] focus:border-sky-500 focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Service Type</label>
                  <input
                    type="text"
                    value={formData.type || ''}
                    onChange={(e) => handleChange('type', e.target.value)}
                    placeholder="API Gateway, Worker..."
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] p-2.5 text-[var(--text-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Version Tag</label>
                  <input
                    type="text"
                    value={formData.version || ''}
                    onChange={(e) => handleChange('version', e.target.value)}
                    placeholder="1.0.0"
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] p-2.5 font-mono text-[var(--text-primary)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">System Domain</label>
                <select
                  value={formData.systemName || ''}
                  onChange={(e) => handleChange('systemName', e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] p-2.5 text-[var(--text-primary)]"
                >
                  {systemsList.map(sys => (
                    <option key={sys.id} value={sys.name}>{sys.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Environment</label>
                  <select
                    value={formData.environment || 'production'}
                    onChange={(e) => handleChange('environment', e.target.value)}
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] p-2.5 text-[var(--text-primary)]"
                  >
                    <option value="production">Production</option>
                    <option value="staging">Staging</option>
                    <option value="development">Development</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Status</label>
                  <select
                    value={formData.status || 'healthy'}
                    onChange={(e) => handleChange('status', e.target.value)}
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] p-2.5 text-[var(--text-primary)]"
                  >
                    <option value="healthy">Healthy</option>
                    <option value="degraded">Degraded</option>
                    <option value="critical">Critical</option>
                    <option value="offline">Offline</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Endpoint URL</label>
                <input
                  type="url"
                  value={formData.endpoint || ''}
                  onChange={(e) => handleChange('endpoint', e.target.value)}
                  placeholder="https://api.platform.example.com/v1"
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] p-2.5 font-mono text-[var(--text-primary)]"
                />
              </div>
            </div>
          )}

          {/* SERVER FORM */}
          {modalType === 'server' && (
            <div className="space-y-3">
              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Server Hostname</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="k8s-node-us-east-01"
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] p-2.5 font-mono text-[var(--text-primary)]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1 font-semibold">IP Address</label>
                  <input
                    type="text"
                    value={formData.ipAddress || ''}
                    onChange={(e) => handleChange('ipAddress', e.target.value)}
                    placeholder="10.128.0.14"
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] p-2.5 font-mono text-[var(--text-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Instance Type</label>
                  <input
                    type="text"
                    value={formData.serverType || ''}
                    onChange={(e) => handleChange('serverType', e.target.value)}
                    placeholder="c6i.2xlarge"
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] p-2.5 text-[var(--text-primary)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Datacenter Region</label>
                <input
                  type="text"
                  value={formData.datacenterRegion || ''}
                  onChange={(e) => handleChange('datacenterRegion', e.target.value)}
                  placeholder="us-east-1 (N. Virginia)"
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] p-2.5 text-[var(--text-primary)]"
                />
              </div>
            </div>
          )}

          {/* LINK SERVICE TO SYSTEM FORM */}
          {modalType === 'link-service' && (
            <div className="space-y-3">
              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Select Target System</label>
                <select
                  value={formData.systemName || ''}
                  onChange={(e) => handleChange('systemName', e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] p-2.5 text-[var(--text-primary)]"
                >
                  {systemsList.map(s => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Select Service to Link</label>
                <select
                  value={formData.serviceName || ''}
                  onChange={(e) => handleChange('serviceName', e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] p-2.5 text-[var(--text-primary)] font-mono"
                >
                  {servicesList.map(s => (
                    <option key={s.id} value={s.name}>{s.name} ({s.type})</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Submit Action */}
          <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-color)]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-slate-700/60 px-4 py-2 font-semibold text-slate-200 hover:bg-slate-700"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 font-bold text-white shadow hover:bg-sky-500 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              <span>{isSubmitting ? 'Saving...' : 'Save & Register'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
