import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { 
  Trello, 
  Plus, 
  Trash2, 
  Check, 
  Calendar, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  User, 
  Car, 
  BookOpen, 
  ExternalLink,
  ChevronRight,
  Pencil,
  Eye,
  EyeOff,
  BarChart2,
  Upload,
  X
} from 'lucide-react';
import { useToastContext } from '@librechat/client';
import { useAuthContext } from '~/hooks';
import { UpgradeWall } from '~/components/SGSST/UpgradeWall';

interface KanbanTask {
  _id: string;
  title: string;
  description?: string;
  status: 'todo' | 'due_soon' | 'overdue' | 'done';
  dueDate: string;
  type: 'manual' | 'medical_exam' | 'soat' | 'rtm' | 'driver_license' | 'training' | 'other';
  referenceId?: string;
  referenceName?: string;
  companyId?: string;
  completedAt?: string;
  createdAt: string;
}

interface KanbanDashboardProps {
  inline?: boolean;
  hideMainHeader?: boolean;
}

export default function KanbanDashboard({ inline = false, hideMainHeader = false }: KanbanDashboardProps = {}) {
  const { user } = useAuthContext();
  const { showToast } = useToastContext();
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showDashboard, setShowDashboard] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('acpm_show_dashboard') !== 'false';
    }
    return true;
  });

  const toggleDashboard = () => {
    setShowDashboard(prev => {
      const next = !prev;
      localStorage.setItem('acpm_show_dashboard', String(next));
      return next;
    });
  };

  // Excel & AI File Import states
  const [importPreview, setImportPreview] = useState<any[] | null>(null);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [pendingFileData, setPendingFileData] = useState<{
    dataUrl: string;
    name: string;
    type: string;
  } | null>(null);
  const [isConfirmAiModalOpen, setIsConfirmAiModalOpen] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const extension = file.name.split('.').pop()?.toLowerCase();

    const requestAiImport = () => {
      const base64Reader = new FileReader();
      base64Reader.onload = (base64Event) => {
        setPendingFileData({
          dataUrl: base64Event.target?.result as string,
          name: file.name,
          type: file.type || 'application/octet-stream'
        });
        setIsConfirmAiModalOpen(true);
      };
      base64Reader.readAsDataURL(file);
    };

    // If PDF, Word, or plain text, go straight to AI
    if (['pdf', 'docx', 'doc', 'txt'].includes(extension || '')) {
      requestAiImport();
      if (e.target) e.target.value = '';
      return;
    }

    // If Excel, read and validate headers
    if (extension === 'xlsx' || extension === 'xls') {
      const reader = new FileReader();
      reader.onload = async (eEvent) => {
        try {
          const data = eEvent.target?.result;
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const importedData = XLSX.utils.sheet_to_json<any>(sheet);

          if (!importedData || importedData.length === 0) {
            showToast({ message: 'El archivo Excel no contiene filas con datos.', status: 'warning' });
            return;
          }

          // Check if there are standard headers in the first row
          const firstRow = importedData[0];
          const keys = Object.keys(firstRow).map(k => k.toLowerCase().replace(/\s+/g, ''));
          const isStandard = keys.some(k => 
            k.includes('actividad') || 
            k.includes('tarea') || 
            k.includes('titulo') || 
            k.includes('nombre') || 
            k.includes('activity') || 
            k.includes('title')
          );

          if (isStandard) {
            // Local Excel mapping
            const parsedTasks: any[] = [];
            importedData.forEach((row: any) => {
              const getVal = (possibleKeys: string[]): any => {
                const rowKeys = Object.keys(row);
                const foundKey = rowKeys.find(rk => {
                  const cleaned = rk.toLowerCase().trim().replace(/\s+/g, '');
                  return possibleKeys.some(pk => cleaned.includes(pk));
                });
                return foundKey ? row[foundKey] : undefined;
              };

              const title = getVal(['actividad', 'tarea', 'titulo', 'nombre', 'activity', 'title']);
              if (!title) return;

              const description = getVal(['descripcion', 'detalles', 'detalle', 'description', 'notes']);

              let dueDateRaw = getVal(['fechalimite', 'fecha', 'vencimiento', 'duedate', 'fechaentrega']);
              let dueDate = '';

              if (dueDateRaw) {
                if (typeof dueDateRaw === 'number') {
                  const dateObj = new Date((dueDateRaw - 25569) * 86400 * 1000);
                  dueDate = dateObj.toISOString().split('T')[0];
                } else {
                  try {
                    const dateObj = new Date(dueDateRaw);
                    if (!isNaN(dateObj.getTime())) {
                      dueDate = dateObj.toISOString().split('T')[0];
                    }
                  } catch {
                    dueDate = '';
                  }
                }
              }

              if (!dueDate) {
                const defaultDate = new Date();
                defaultDate.setDate(defaultDate.getDate() + 7);
                dueDate = defaultDate.toISOString().split('T')[0];
              }

              const statusRaw = getVal(['estado', 'status', 'columna']);
              let status: 'todo' | 'due_soon' | 'overdue' | 'done' = 'todo';
              if (statusRaw) {
                const statusStr = String(statusRaw).toLowerCase().trim();
                if (statusStr.includes('completada') || statusStr.includes('hecha') || statusStr.includes('done') || statusStr.includes('terminada')) {
                  status = 'done';
                } else if (statusStr.includes('vencida') || statusStr.includes('overdue') || statusStr.includes('alerta')) {
                  status = 'overdue';
                } else if (statusStr.includes('proxima') || statusStr.includes('próxima') || statusStr.includes('due_soon')) {
                  status = 'due_soon';
                }
              }

              const typeRaw = getVal(['categoria', 'categoría', 'tipo', 'type']);
              let type = 'manual';
              if (typeRaw) {
                const typeStr = String(typeRaw).toLowerCase().trim();
                if (typeStr.includes('capacitacion') || typeStr.includes('capacitación') || typeStr.includes('training')) {
                  type = 'training';
                } else if (typeStr.includes('examen') || typeStr.includes('medical')) {
                  type = 'medical_exam';
                } else if (typeStr.includes('soat')) {
                  type = 'soat';
                } else if (typeStr.includes('rtm') || typeStr.includes('tecnomecanica')) {
                  type = 'rtm';
                } else if (typeStr.includes('licencia')) {
                  type = 'driver_license';
                } else if (typeStr.includes('otro') || typeStr.includes('other')) {
                  type = 'other';
                }
              }

              parsedTasks.push({
                title: String(title).trim(),
                description: description ? String(description).trim() : '',
                dueDate,
                status,
                type
              });
            });

            if (parsedTasks.length === 0) {
              showToast({ message: 'No se encontraron actividades válidas en el Excel. Asegúrate de incluir una columna "Actividad" o "Tarea".', status: 'warning' });
              return;
            }

            setImportPreview(parsedTasks);
          } else {
            // Non-standard Excel, go to AI import
            requestAiImport();
          }
        } catch (err) {
          console.error('Error importing Excel:', err);
          showToast({ message: 'Error al leer el archivo Excel. Verifica el formato.', status: 'error' });
        } finally {
          if (e.target) e.target.value = '';
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const handleConfirmAiImport = async () => {
    if (!pendingFileData) return;
    setIsConfirmAiModalOpen(false);
    setIsAiLoading(true);
    try {
      const res = await axios.post('/api/sgsst/kanban/import-file', {
        fileData: pendingFileData.dataUrl,
        fileName: pendingFileData.name,
        mimeType: pendingFileData.type
      });
      if (res.data && res.data.tasks) {
        setImportPreview(res.data.tasks);
        showToast({ message: `IA procesó el archivo con éxito. Detectó ${res.data.tasks.length} actividades.`, status: 'success' });
      } else {
        showToast({ message: 'No se pudieron extraer actividades con IA.', status: 'warning' });
      }
    } catch (err: any) {
      console.error('Error in AI import:', err);
      showToast({ message: err.response?.data?.error || 'Error al procesar el archivo con IA', status: 'error' });
    } finally {
      setIsAiLoading(false);
      setPendingFileData(null);
    }
  };

  const handleConfirmImport = async () => {
    if (!importPreview || importPreview.length === 0) return;
    setIsImporting(true);
    try {
      await axios.post('/api/sgsst/kanban/bulk-save', { tasks: importPreview });
      showToast({ message: `¡Se importaron ${importPreview.length} actividades correctamente!`, status: 'success' });
      setImportPreview(null);
      fetchTasks();
    } catch (err) {
      console.error('Error saving imported tasks:', err);
      showToast({ message: 'No se pudieron guardar las actividades importadas.', status: 'error' });
    } finally {
      setIsImporting(false);
    }
  };
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>('');
  const [newDesc, setNewDesc] = useState<string>('');
  const [newDueDate, setNewDueDate] = useState<string>('');
  const [newType, setNewType] = useState<string>('manual');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [editingTask, setEditingTask] = useState<KanbanTask | null>(null);
  const [renewalDate, setRenewalDate] = useState<string>('');

  const getRenewalDetails = (task: KanbanTask) => {
    if (task.referenceId && task.referenceId.startsWith('training_session')) {
      return {
        title: 'Cierre de Sesión de Capacitación',
        label: 'Fecha de realización de la capacitación *',
        helper: 'Al registrar la realización, se cambiará el estado de la capacitación a "Completada" en tu cronograma.',
      };
    }
    if (task.referenceId && (task.referenceId.includes('-bio-') || task.referenceId.includes('-biocentric'))) {
      return {
        title: 'Gestión y Cierre de Alerta de Salud (Auditoría Biocéntrica)',
        label: 'Fecha de intervención o seguimiento médico *',
        helper: 'Ingresa la fecha en que se realizó el seguimiento o medida de control para el trabajador.',
      };
    }
    switch (task.type) {
      case 'medical_exam':
        return {
          title: 'Cierre y Registro de Examen Médico',
          label: 'Fecha de realización del nuevo examen *',
          helper: 'Al registrar la realización, Wappy actualizará la ficha del trabajador y programará automáticamente el próximo examen anual.',
        };
      case 'soat':
        return {
          title: 'Cierre y Registro de SOAT',
          label: 'Nueva fecha de vencimiento del SOAT *',
          helper: 'Al registrar, se actualizará el vencimiento del SOAT en el módulo de vehículos con la nueva fecha ingresada.',
        };
      case 'rtm':
        return {
          title: 'Cierre y Registro de Revisión Técnico-Mecánica',
          label: 'Nueva fecha de vencimiento de la RTM *',
          helper: 'Al registrar, se actualizará el vencimiento de la RTM en el módulo de vehículos con la nueva fecha ingresada.',
        };
      case 'driver_license':
        return {
          title: 'Cierre y Registro de Licencia de Conducción / SST',
          label: 'Nueva fecha de vencimiento de la Licencia *',
          helper: 'Al registrar, se actualizará el vencimiento de la licencia en la ficha del trabajador.',
        };
      case 'training':
        return {
          title: 'Cierre y Registro de Curso de Alturas / Capacitación',
          label: 'Fecha de realización del nuevo curso *',
          helper: 'Al registrar, se actualizará la fecha del curso en la ficha del trabajador y se reprogramará su vencimiento anual.',
        };
      default:
        return {
          title: 'Cierre y Registro de Actividad',
          label: 'Nueva fecha de realización / vencimiento *',
          helper: 'Al registrar, se actualizarán los datos vinculados al sistema.',
        };
    }
  };

  const isAdmin = user?.role === 'ADMIN';
  const isProOrAdmin = user?.role === 'ADMIN' || user?.role === 'USER_PRO' || Boolean(user?.isSubUser);
  const isLocked = !isProOrAdmin;

  // Fetch tasks
  const fetchTasks = async () => {
    try {
      const res = await axios.get('/api/sgsst/kanban/data');
      setTasks(res.data);
    } catch (err) {
      console.error('Error fetching Kanban tasks:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  // Handle Drag and Drop
  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('taskId', id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, newStatus: 'todo' | 'due_soon' | 'overdue' | 'done') => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    if (!taskId) return;

    // Find the task
    const task = tasks.find(t => t._id === taskId);
    if (!task || task.status === newStatus) return;

    // Optimistic UI update
    const previousTasks = [...tasks];
    setTasks(prev => prev.map(t => t._id === taskId ? { ...t, status: newStatus } : t));

    try {
      await axios.post('/api/sgsst/kanban/save', {
        _id: taskId,
        status: newStatus
      });
      showToast({
        message: `Actividad movida a ${getStatusLabel(newStatus)}`,
        status: 'success'
      });
    } catch (err) {
      console.error('Error updating task status:', err);
      setTasks(previousTasks);
      showToast({
        message: 'Error al cambiar el estado de la actividad.',
        status: 'error'
      });
    }
  };

  const openCreateModal = () => {
    setEditingTask(null);
    setNewTitle('');
    setNewDesc('');
    setNewDueDate('');
    setNewType('manual');
    setRenewalDate('');
    setIsModalOpen(true);
  };

  const openEditModal = (task: KanbanTask) => {
    setEditingTask(task);
    setNewTitle(task.title);
    setNewDesc(task.description || '');
    const dateStr = task.dueDate.split('T')[0];
    setNewDueDate(dateStr);
    setNewType(task.type);
    setRenewalDate('');
    setIsModalOpen(true);
  };

  // Create or update task
  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDueDate) {
      showToast({ message: 'Título y fecha límite son obligatorios.', status: 'warning' });
      return;
    }

    setIsSaving(true);
    try {
      if (editingTask) {
        // Edit mode
        const res = await axios.post('/api/sgsst/kanban/save', {
          _id: editingTask._id,
          title: newTitle,
          description: newDesc,
          dueDate: newDueDate,
          type: newType,
          status: editingTask.status,
          renewalDate: renewalDate || undefined
        });

        setTasks(prev => prev.map(t => t._id === editingTask._id ? res.data : t));
        showToast({ message: 'Actividad actualizada correctamente.', status: 'success' });
      } else {
        // Create mode
        const res = await axios.post('/api/sgsst/kanban/save', {
          title: newTitle,
          description: newDesc,
          dueDate: newDueDate,
          type: newType,
          status: 'todo'
        });

        setTasks(prev => [...prev, res.data]);
        showToast({ message: 'Actividad programada correctamente.', status: 'success' });
      }
      setIsModalOpen(false);
      
      // Reset form
      setNewTitle('');
      setNewDesc('');
      setNewDueDate('');
      setNewType('manual');
      setRenewalDate('');
      setEditingTask(null);
    } catch (err) {
      console.error('Error saving task:', err);
      showToast({ message: 'No se pudo guardar la actividad.', status: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  // Delete task
  const handleDeleteTask = async (id: string) => {
    if (!window.confirm('¿Estás seguro de eliminar esta actividad del tablero?')) return;

    try {
      await axios.delete(`/api/sgsst/kanban/delete/${id}`);
      setTasks(prev => prev.filter(t => t._id !== id));
      showToast({ message: 'Actividad eliminada.', status: 'success' });
    } catch (err) {
      console.error('Error deleting task:', err);
      showToast({ message: 'No se pudo eliminar la actividad.', status: 'error' });
    }
  };

  // Mark complete directly
  const handleMarkComplete = async (id: string) => {
    try {
      const res = await axios.post('/api/sgsst/kanban/save', {
        _id: id,
        status: 'done'
      });
      setTasks(prev => prev.map(t => t._id === id ? res.data : t));
      showToast({ message: 'Actividad completada y archivada.', status: 'success' });
    } catch (err) {
      console.error('Error completing task:', err);
      showToast({ message: 'No se pudo completar la actividad.', status: 'error' });
    }
  };

  const handleAcceptGroupInvite = async (invitationId: string) => {
    try {
      await axios.post(`/api/chat-sst/invitations/${invitationId}/accept`);
      showToast({ message: '¡Invitación aceptada! Te has unido al grupo.', status: 'success' });
      fetchTasks();
    } catch (err) {
      console.error('Error al aceptar invitación:', err);
      showToast({ message: 'No se pudo aceptar la invitación.', status: 'error' });
    }
  };

  const handleRejectGroupInvite = async (invitationId: string) => {
    try {
      await axios.post(`/api/chat-sst/invitations/${invitationId}/reject`);
      showToast({ message: 'Invitación rechazada.', status: 'success' });
      fetchTasks();
    } catch (err) {
      console.error('Error al rechazar invitación:', err);
      showToast({ message: 'No se pudo rechazar la invitación.', status: 'error' });
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'todo': return 'Pendiente';
      case 'due_soon': return 'Próxima a vencer';
      case 'overdue': return 'Vencida';
      case 'done': return 'Completada';
      default: return status;
    }
  };



  // Calculate stats
  const totalCount = tasks.length;
  const overdueCount = tasks.filter(t => t.status === 'overdue').length;
  const dueSoonCount = tasks.filter(t => t.status === 'due_soon').length;
  const doneCount = tasks.filter(t => t.status === 'done').length;

  // Filter tasks into columns
  const todoTasks = tasks.filter(t => t.status === 'todo');
  const dueSoonTasks = tasks.filter(t => t.status === 'due_soon');
  const overdueTasks = tasks.filter(t => t.status === 'overdue');
  const doneTasks = tasks.filter(t => t.status === 'done');

  // Compliance calculations
  const complianceRate = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 100;
  
  const donePct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const dueSoonPct = totalCount > 0 ? Math.round((dueSoonCount / totalCount) * 100) : 0;
  const overduePct = totalCount > 0 ? Math.round((overdueCount / totalCount) * 100) : 0;
  const todoPct = totalCount > 0 ? Math.round((todoTasks.length / totalCount) * 100) : 0;

  const categoryInfo: Record<string, { label: string; color: string; bg: string }> = {
    medical_exam: { label: 'Exámenes Médicos', color: 'text-blue-500 dark:text-blue-400', bg: 'bg-blue-500' },
    soat: { label: 'SOAT Vehículos', color: 'text-purple-500 dark:text-purple-400', bg: 'bg-purple-500' },
    rtm: { label: 'Técnico-Mecánica', color: 'text-amber-500 dark:text-amber-400', bg: 'bg-amber-500' },
    driver_license: { label: 'Licencias Conducción', color: 'text-rose-500 dark:text-rose-400', bg: 'bg-rose-500' },
    training: { label: 'Capacitaciones SST', color: 'text-emerald-500 dark:text-emerald-400', bg: 'bg-emerald-500' },
    manual: { label: 'Tareas Generales', color: 'text-gray-500 dark:text-gray-400', bg: 'bg-gray-500' },
    other: { label: 'Otros', color: 'text-slate-500 dark:text-slate-400', bg: 'bg-slate-500' }
  };

  const categoryStats = Object.keys(categoryInfo).map(type => {
    const typeTasks = tasks.filter(t => t.type === type);
    const total = typeTasks.length;
    const completed = typeTasks.filter(t => t.status === 'done').length;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return {
      type,
      total,
      completed,
      rate,
      ...categoryInfo[type]
    };
  }).filter(c => c.total > 0);

  // Render type icon & badge
  const renderTaskBadge = (task: KanbanTask) => {
    let icon = <Clock className="w-3.5 h-3.5" />;
    let text = 'General';
    let color = 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    let redirectPath = '';

    if (task.referenceId && (task.referenceId.includes('-bio-') || task.referenceId.includes('-biocentric'))) {
      icon = <AlertTriangle className="w-3.5 h-3.5" />;
      text = 'Alerta Médica';
      color = 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800/40';
      redirectPath = '/sgsst?tab=workers';
    } else if (task.referenceId && task.referenceId.startsWith('training_session')) {
      icon = <BookOpen className="w-3.5 h-3.5" />;
      text = 'Capacitación Programada';
      color = 'bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-800/40';
      redirectPath = '/sgsst?tab=capacitaciones';
    } else if (task.type === 'medical_exam') {
      icon = <User className="w-3.5 h-3.5" />;
      text = 'Examen Médico';
      color = 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/40';
      redirectPath = '/sgsst?tab=workers';
    } else if (task.type === 'soat') {
      icon = <Car className="w-3.5 h-3.5" />;
      text = 'SOAT';
      color = 'bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800/40';
      redirectPath = '/sgsst?tab=vehicles';
    } else if (task.type === 'rtm') {
      icon = <Car className="w-3.5 h-3.5" />;
      text = 'Revisión Técnico-Mecánica';
      color = 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/40';
      redirectPath = '/sgsst?tab=vehicles';
    } else if (task.type === 'driver_license') {
      icon = <User className="w-3.5 h-3.5" />;
      text = 'Licencia';
      color = 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800/40';
      redirectPath = '/sgsst?tab=workers';
    } else if (task.type === 'training') {
      icon = <BookOpen className="w-3.5 h-3.5" />;
      text = 'Capacitación';
      color = 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800/40';
      redirectPath = '/sgsst?tab=capacitaciones';
    }

    return (
      <div className="flex items-center justify-between gap-1.5 mt-2.5">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${color}`}>
          {icon}
          {text}
        </span>
        
        {redirectPath && task.status !== 'done' && (
          <a 
            href={redirectPath}
            className="text-[10px] text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-0.5 font-semibold"
          >
            Actualizar <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
      </div>
    );
  };

  // Format date helper
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
    } catch {
      return dateStr;
    }
  };

  const getDaysDiffText = (task: KanbanTask) => {
    if (task.status === 'done') {
      return 'Completado';
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(task.dueDate);
    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return `Hace ${Math.abs(diffDays)} ${Math.abs(diffDays) === 1 ? 'día' : 'días'}`;
    } else if (diffDays === 0) {
      return 'Vence HOY';
    } else {
      return `Faltan ${diffDays} ${diffDays === 1 ? 'día' : 'días'}`;
    }
  };

  return (
    <div className={`flex-1 flex flex-col bg-surface-secondary/30 relative ${
      inline 
        ? "h-[650px] rounded-3xl border border-border-medium/30 shadow-inner overflow-hidden" 
        : "min-h-screen h-auto overflow-y-auto pb-12"
    }`}>
      <div className={`flex-1 flex flex-col ${
        inline ? "min-h-0 overflow-hidden" : "h-auto overflow-visible"
      } ${isLocked ? 'filter blur-[8px] pointer-events-none select-none' : ''}`}>
        {/* Upper header */}
      <div className={`flex flex-col md:flex-row justify-between items-start md:items-center p-6 bg-white dark:bg-gray-900 border-b border-border-medium/40 gap-4 ${inline ? 'py-3.5 px-5' : ''} ${hideMainHeader ? 'py-3.5 px-6' : ''}`}>
        {!hideMainHeader ? (
          !inline ? (
            <div>
              <h1 className="text-2xl font-extrabold flex items-center gap-2.5 bg-clip-text text-transparent bg-gradient-to-r from-teal-600 to-emerald-600 dark:from-teal-400 dark:to-emerald-400">
                <Trello className="w-7 h-7 text-teal-500" />
                Centro de Control ACPM
              </h1>
              <p className="text-xs text-text-secondary mt-1">
                Programación de actividades de seguridad y salud en el trabajo con control predictivo de vencimientos.
              </p>
            </div>
          ) : (
            <div>
              <h2 className="text-base font-extrabold text-text-primary flex items-center gap-2">
                <Trello className="w-4.5 h-4.5 text-teal-500" />
                Acciones de Control ACPM
              </h2>
              <p className="text-[10px] text-text-tertiary mt-0.5">
                Programación de actividades y control predictivo de vencimientos.
              </p>
            </div>
          )
        ) : (
          <div>
            <h2 className="text-base font-extrabold text-text-primary flex items-center gap-2">
              <Trello className="w-5 h-5 text-teal-500" />
              Tablero de Acciones Correctivas, Preventivas y de Mejora
            </h2>
            <p className="text-xs text-text-secondary mt-0.5">
              Control predictivo de vencimientos y asignación de compromisos.
            </p>
          </div>
        )}
        <div className="flex items-center gap-2.5 shrink-0 w-full sm:w-auto justify-end">
          <button
            onClick={toggleDashboard}
            className={`group flex items-center justify-center h-9 px-3.5 sm:h-10 sm:px-4 rounded-xl border border-border-medium/40 text-xs font-bold transition-all duration-300 gap-2 cursor-pointer shadow-sm ${
              showDashboard 
                ? 'bg-teal-500/10 text-teal-600 border-teal-500/20 hover:bg-teal-500/20 dark:bg-teal-950/20 dark:text-teal-400' 
                : 'bg-white dark:bg-gray-900 text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
            title={showDashboard ? "Ocultar Dashboard" : "Mostrar Dashboard"}
          >
            {showDashboard ? (
              <>
                <EyeOff className="w-4.5 h-4.5 text-current" />
                <span className="hidden sm:inline">Ocultar Analíticas</span>
                <span className="sm:hidden">Ocultar</span>
              </>
            ) : (
              <>
                <Eye className="w-4.5 h-4.5 text-current" />
                <span className="hidden sm:inline">Ver Analíticas</span>
                <span className="sm:hidden">Analíticas</span>
              </>
            )}
          </button>

          <button
            onClick={triggerFileInput}
            className="group flex items-center justify-center h-9 px-3.5 min-w-[36px] sm:h-10 sm:px-3 sm:min-w-[40px] transition-all duration-300 shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 shrink-0 cursor-pointer border border-transparent outline-none rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white sm:hover:rotate-3 sm:hover:scale-105 active:scale-95"
            title="Importar Actividades (Excel, Word, PDF, Texto)"
          >
            <div className="relative flex-shrink-0 flex items-center justify-center">
              <Upload className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="hidden sm:flex items-center max-w-0 overflow-hidden opacity-0 group-hover:max-w-[200px] group-hover:opacity-100 group-hover:ml-2 transition-all duration-300 ease-in-out whitespace-nowrap">
              <span className="text-xs sm:text-sm font-bold tracking-wide">Importar Archivo</span>
            </div>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept=".xlsx, .xls, .pdf, .docx, .doc, .txt"
          />

          <button
            onClick={openCreateModal}
            className="group flex items-center justify-center h-9 px-3.5 min-w-[36px] sm:h-10 sm:px-3 sm:min-w-[40px] transition-all duration-300 shadow-lg shadow-teal-500/10 hover:shadow-teal-500/20 shrink-0 cursor-pointer border border-transparent outline-none rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white sm:hover:-rotate-3 sm:hover:scale-105 active:scale-95"
            title="Nueva Actividad"
          >
            <div className="relative flex-shrink-0 flex items-center justify-center">
              <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="hidden sm:flex items-center max-w-0 overflow-hidden opacity-0 group-hover:max-w-[200px] group-hover:opacity-100 group-hover:ml-2 transition-all duration-300 ease-in-out whitespace-nowrap">
              <span className="text-xs sm:text-sm font-bold tracking-wide">Nueva Actividad</span>
            </div>
          </button>
        </div>
      </div>

      {/* Compliance Dashboard Panel */}
      {showDashboard && (
        <div className="px-6 pt-4 pb-2 transform transition-all duration-300 ease-in-out origin-top">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 p-5 bg-white dark:bg-gray-900 border border-border-medium/30 rounded-3xl shadow-sm">
            
            {/* Card 1: General Compliance Donut Chart */}
            <div className="p-4 bg-surface-secondary/20 dark:bg-gray-950 border border-border-medium/20 rounded-2xl flex items-center gap-5 shadow-sm relative overflow-hidden group">
              <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <defs>
                    <linearGradient id="complianceGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#0d9488" />
                      <stop offset="100%" stopColor="#10b981" />
                    </linearGradient>
                  </defs>
                  <circle 
                    cx="48" 
                    cy="48" 
                    r="38" 
                    className="stroke-gray-100 dark:stroke-gray-800" 
                    strokeWidth="8" 
                    fill="transparent" 
                  />
                  <circle 
                    cx="48" 
                    cy="48" 
                    r="38" 
                    stroke="url(#complianceGrad)"
                    strokeWidth="8" 
                    fill="transparent" 
                    strokeDasharray={2 * Math.PI * 38} 
                    strokeDashoffset={2 * Math.PI * 38 * (1 - complianceRate / 100)} 
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-black text-text-primary">{complianceRate}%</span>
                  <span className="text-[8px] text-text-tertiary font-bold uppercase tracking-wider">Logrado</span>
                </div>
              </div>
              
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-extrabold text-text-primary tracking-wide uppercase">Cumplimiento General</h4>
                <p className="text-[11px] text-text-secondary mt-1">
                  Se han completado <strong className="text-teal-600 dark:text-teal-400 font-bold">{doneCount}</strong> de <strong className="text-text-primary font-bold">{totalCount}</strong> actividades totales.
                </p>
                <div className="mt-2.5">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                    complianceRate >= 90 
                      ? 'bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400' 
                      : complianceRate >= 70
                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400'
                        : 'bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400'
                  }`}>
                    {complianceRate >= 90 ? '¡Excelente Trabajo!' : complianceRate >= 70 ? 'Buen Progreso' : 'Atención Requerida'}
                  </span>
                </div>
              </div>
            </div>

            {/* Card 2: Status Distribution Stacked Bar */}
            <div className="p-4 bg-surface-secondary/20 dark:bg-gray-950 border border-border-medium/20 rounded-2xl flex flex-col justify-between shadow-sm">
              <div>
                <h4 className="text-xs font-extrabold text-text-primary tracking-wide uppercase flex items-center gap-1.5">
                  <BarChart2 className="w-4 h-4 text-teal-500" />
                  Distribución de Estados
                </h4>
                <p className="text-[10px] text-text-tertiary mt-0.5">Representación de la carga de trabajo por estado.</p>
              </div>

              {/* Stacked Progress Bar */}
              <div className="mt-3.5 h-3 w-full bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden flex gap-[2px]">
                {doneCount > 0 && (
                  <div 
                    style={{ width: `${(doneCount / totalCount) * 100}%` }}
                    className="h-full bg-green-500 transition-all duration-500"
                    title={`Completadas: ${doneCount}`}
                  />
                )}
                {dueSoonCount > 0 && (
                  <div 
                    style={{ width: `${(dueSoonCount / totalCount) * 100}%` }}
                    className="h-full bg-amber-500 transition-all duration-500 animate-pulse"
                    title={`Próximas a vencer: ${dueSoonCount}`}
                  />
                )}
                {overdueCount > 0 && (
                  <div 
                    style={{ width: `${(overdueCount / totalCount) * 100}%` }}
                    className="h-full bg-rose-500 transition-all duration-500"
                    title={`Vencidas (Alerta): ${overdueCount}`}
                  />
                )}
                {todoTasks.length > 0 && (
                  <div 
                    style={{ width: `${(todoTasks.length / totalCount) * 100}%` }}
                    className="h-full bg-gray-400 dark:bg-gray-600 transition-all duration-500"
                    title={`Pendientes: ${todoTasks.length}`}
                  />
                )}
                {totalCount === 0 && (
                  <div className="h-full w-full bg-gray-200 dark:bg-gray-800 transition-all duration-500" />
                )}
              </div>

              {/* Legend with percentages */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-3">
                <div className="flex items-center gap-1.5 text-[10px] text-text-secondary font-semibold">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="truncate">Hechas: {donePct}%</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-text-secondary font-semibold">
                  <span className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-600" />
                  <span className="truncate">Pendientes: {todoPct}%</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-text-secondary font-semibold">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="truncate">Próximas: {dueSoonPct}%</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-text-secondary font-semibold">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  <span className="truncate">Vencidas: {overduePct}%</span>
                </div>
              </div>
            </div>

            {/* Card 3: Category Compliance Breakdown */}
            <div className="p-4 bg-surface-secondary/20 dark:bg-gray-950 border border-border-medium/20 rounded-2xl flex flex-col justify-between shadow-sm min-h-[120px]">
              <div>
                <h4 className="text-xs font-extrabold text-text-primary tracking-wide uppercase">Cumplimiento por Categoría</h4>
                <p className="text-[10px] text-text-tertiary mt-0.5">Rendimiento por tipo de control.</p>
              </div>
              
              <div className="mt-3.5 flex flex-col gap-2.5 max-h-[96px] overflow-y-auto pr-1">
                {categoryStats.length === 0 ? (
                  <div className="text-[11px] text-text-tertiary italic text-center py-2">
                    Sin actividades activas
                  </div>
                ) : (
                  categoryStats.slice(0, 3).map(cat => (
                    <div key={cat.type} className="flex flex-col gap-1">
                      <div className="flex justify-between items-center text-[10px] font-bold">
                        <span className="text-text-primary truncate">{cat.label}</span>
                        <span className={`${cat.color}`}>{cat.completed}/{cat.total} ({cat.rate}%)</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div 
                          style={{ width: `${cat.rate}%` }}
                          className={`h-full ${cat.bg} transition-all duration-500 rounded-full`}
                        />
                      </div>
                    </div>
                  ))
                )}
                {categoryStats.length > 3 && (
                  <div className="text-[9px] text-text-tertiary font-bold text-right">
                    + {categoryStats.length - 3} categorías más
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Analytics Summary Banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-6 pt-4 pb-2">
        <div className="p-3 bg-white dark:bg-gray-900 border border-border-medium/30 rounded-2xl flex items-center gap-3.5 shadow-sm">
          <div className="p-2 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-500">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Total Tareas</div>
            <div className="text-lg font-extrabold text-text-primary">{totalCount}</div>
          </div>
        </div>

        <div className="p-3 bg-white dark:bg-gray-900 border border-border-medium/30 rounded-2xl flex items-center gap-3.5 shadow-sm">
          <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/20 text-rose-500">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Vencidas</div>
            <div className="text-lg font-extrabold text-rose-500">{overdueCount}</div>
          </div>
        </div>

        <div className="p-3 bg-white dark:bg-gray-900 border border-border-medium/30 rounded-2xl flex items-center gap-3.5 shadow-sm">
          <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/20 text-amber-500">
            <Clock className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Próximas</div>
            <div className="text-lg font-extrabold text-amber-500">{dueSoonCount}</div>
          </div>
        </div>

        <div className="p-3 bg-white dark:bg-gray-900 border border-border-medium/30 rounded-2xl flex items-center gap-3.5 shadow-sm">
          <div className="p-2 rounded-xl bg-green-50 dark:bg-green-950/20 text-green-500">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Completadas</div>
            <div className="text-lg font-extrabold text-green-600 dark:text-green-400">{doneCount}</div>
          </div>
        </div>
      </div>

      {/* Loading */}
      {isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center text-text-secondary">
          <Clock className="w-8 h-8 animate-spin text-teal-500 mb-2" />
          <span>Cargando tablero...</span>
        </div>
      ) : (
        /* Board columns container */
        <div className={`overflow-x-auto p-6 flex gap-6 select-none ${
          inline ? "flex-1" : "h-[750px] min-h-[600px]"
        }`}>
          {/* Column template */}
          {[
            { id: 'todo', title: 'Pendientes', tasks: todoTasks, border: 'border-t-4 border-t-gray-400', headerBg: 'bg-gray-500/10 text-gray-700 dark:text-gray-300' },
            { id: 'due_soon', title: 'Próximas a Vencer', tasks: dueSoonTasks, border: 'border-t-4 border-t-amber-500', headerBg: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
            { id: 'overdue', title: 'Vencidas (Alerta)', tasks: overdueTasks, border: 'border-t-4 border-t-rose-500', headerBg: 'bg-rose-500/10 text-rose-700 dark:text-rose-400' },
            { id: 'done', title: 'Completadas', tasks: doneTasks, border: 'border-t-4 border-t-green-500', headerBg: 'bg-green-500/10 text-green-700 dark:text-green-400' }
          ].map(col => (
            <div 
              key={col.id}
              className={`flex-shrink-0 w-80 flex flex-col h-full bg-white/70 dark:bg-gray-900/70 border border-border-medium/35 rounded-2xl shadow-sm overflow-hidden ${col.border}`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, col.id as any)}
            >
              {/* Column Header */}
              <div className="p-3.5 flex items-center justify-between border-b border-border-medium/30 bg-surface-primary dark:bg-gray-900/40">
                <h3 className="font-bold text-sm text-text-primary flex items-center gap-2">
                  {col.title}
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${col.headerBg}`}>
                    {col.tasks.length}
                  </span>
                </h3>
              </div>

              {/* Column Cards List */}
              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 min-h-[200px]">
                {col.tasks.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-border-medium/20 rounded-2xl text-text-tertiary">
                    <Trello className="w-8 h-8 opacity-30 mb-2" />
                    <span className="text-[11px] font-semibold">Suelta o agrega actividades aquí</span>
                  </div>
                ) : (
                  col.tasks.map(task => (
                    <div
                      key={task._id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task._id)}
                      className="p-3.5 bg-white dark:bg-gray-950 border border-border-medium/40 hover:border-teal-500/40 dark:border-white/5 rounded-xl shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing transition-all group flex flex-col justify-between"
                    >
                      <div>
                        {/* Title & Actions */}
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-bold text-[13px] text-text-primary leading-tight group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                            {task.title}
                          </h4>
                          <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-all">
                            <button
                              onClick={() => openEditModal(task)}
                              className="p-1 text-text-tertiary hover:text-teal-600 hover:bg-teal-50/50 dark:hover:bg-teal-950/20 rounded transition-all"
                              title="Editar actividad"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteTask(task._id)}
                              className="p-1 text-text-tertiary hover:text-red-500 hover:bg-red-50/50 dark:hover:bg-red-950/20 rounded transition-all"
                              title="Eliminar actividad"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Description */}
                        {task.description && (
                          <p className="text-[11px] text-text-secondary mt-1.5 line-clamp-2 leading-relaxed">
                            {task.description}
                          </p>
                        )}

                        {/* Reference name */}
                        {task.referenceName && (
                          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-text-tertiary font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                            {task.referenceName}
                          </div>
                        )}
                      </div>

                      {/* Footer: Date & State badges */}
                      <div className="mt-3 pt-3 border-t border-border-medium/20 flex flex-col gap-2">
                        <div className="flex items-center justify-between text-[11px] text-text-tertiary">
                          <span className="flex items-center gap-1 font-semibold">
                            <Calendar className="w-3.5 h-3.5 text-text-tertiary" />
                            {formatDate(task.dueDate)}
                          </span>
                          
                          <span className={`px-1.5 py-0.5 rounded font-extrabold text-[10px] uppercase ${
                            task.status === 'overdue' 
                              ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/20' 
                              : task.status === 'due_soon' 
                                ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/20'
                                : task.status === 'done'
                                  ? 'bg-green-50 text-green-600 dark:bg-green-950/20'
                                  : 'bg-gray-50 text-gray-600 dark:bg-gray-800'
                          }`}>
                            {getDaysDiffText(task)}
                          </span>
                        </div>

                        {renderTaskBadge(task)}

                        {/* Complete action quick button */}
                        {task.status !== 'done' && (
                          task.referenceName === 'group_invitation' ? (
                            <div className="mt-2.5 flex items-center gap-2 w-full">
                              <button
                                onClick={() => handleAcceptGroupInvite(task.referenceId || '')}
                                className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-bold transition-all shadow-xs"
                              >
                                <Check className="w-3.5 h-3.5" />
                                Aceptar
                              </button>
                              <button
                                onClick={() => handleRejectGroupInvite(task.referenceId || '')}
                                className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-zinc-150 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-750 dark:text-zinc-300 rounded-lg text-[11px] font-bold transition-all border border-zinc-200 dark:border-zinc-700"
                              >
                                <X className="w-3.5 h-3.5" />
                                Rechazar
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                if (task.type !== 'manual') {
                                  openEditModal(task);
                                } else {
                                  handleMarkComplete(task._id);
                                }
                              }}
                              className="mt-2.5 flex items-center justify-center gap-1.5 w-full py-1 bg-surface-tertiary hover:bg-green-500/10 hover:text-green-600 dark:hover:bg-green-950/20 dark:hover:text-green-400 rounded-lg text-[11px] font-bold text-text-secondary transition-all"
                            >
                              <Check className="w-3.5 h-3.5" />
                              {task.type !== 'manual' ? 'Registrar Cierre / Renovación' : 'Marcar completado'}
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      </div>

      {/* Premium Lock Overlay for Free / non-Pro Plan */}
      {isLocked && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/10 backdrop-blur-[2px] p-4 sm:p-6 md:p-8">
          <UpgradeWall
            isPopup={true}
            title="Centro de Control ACPM Exclusivo"
            description="El acceso a la programación de actividades y control predictivo de vencimientos en el Centro de Control ACPM es exclusivo de los planes Wappy Pro. Evoluciona hoy tu plan para estar al día."
          />
        </div>
      )}

      {/* Create Task Dialog Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-border-medium/30 transform duration-300 animate-in zoom-in-95">
            <div className="p-6 border-b border-border-medium/30">
              <h2 className="text-lg font-extrabold text-text-primary flex items-center gap-2">
                {editingTask ? <Pencil className="w-5 h-5 text-teal-500" /> : <Plus className="w-5 h-5 text-teal-500" />}
                {editingTask ? 'Editar Actividad' : 'Programar Actividad Manual'}
              </h2>
              <p className="text-xs text-text-tertiary mt-0.5">
                {editingTask ? 'Modifica los detalles de la tarjeta seleccionada.' : 'Crea una nueva tarjeta en tu plan de trabajo de seguridad y salud.'}
              </p>
            </div>
            
            <form onSubmit={handleSaveTask} className="p-6 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-secondary">Título de la Actividad *</label>
                <input 
                  type="text" 
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ej: Inspección mensual de botiquines"
                  className="px-3.5 py-2.5 bg-surface-tertiary/40 border border-border-medium/40 rounded-xl text-sm focus:outline-none focus:border-teal-500 text-text-primary w-full disabled:opacity-65"
                  required
                  disabled={editingTask !== null && editingTask.type !== 'manual'}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-secondary">Descripción (Opcional)</label>
                <textarea 
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Detalles sobre la actividad a realizar..."
                  className="px-3.5 py-2.5 bg-surface-tertiary/40 border border-border-medium/40 rounded-xl text-sm focus:outline-none focus:border-teal-500 text-text-primary min-h-[80px] w-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-secondary">Fecha Límite *</label>
                  <input 
                    type="date" 
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="px-3.5 py-2.5 bg-surface-tertiary/40 border border-border-medium/40 rounded-xl text-sm focus:outline-none focus:border-teal-500 text-text-primary w-full disabled:opacity-65"
                    required
                    disabled={editingTask !== null && editingTask.type !== 'manual'}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-secondary">Categoría</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                    className="px-3.5 py-2.5 bg-surface-tertiary/40 border border-border-medium/40 rounded-xl text-sm focus:outline-none focus:border-teal-500 text-text-primary w-full cursor-pointer disabled:opacity-65"
                    disabled={editingTask !== null && editingTask.type !== 'manual'}
                  >
                    <option value="manual">General / Manual</option>
                    <option value="training">Capacitación</option>
                    <option value="other">Otro</option>
                  </select>
                </div>
              </div>

              {editingTask && editingTask.type !== 'manual' && (
                <div className="p-4 bg-teal-500/5 dark:bg-teal-500/10 border border-teal-500/30 rounded-2xl flex flex-col gap-3.5 mt-2 transition-all">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-xs font-extrabold text-teal-800 dark:text-teal-300">
                        {getRenewalDetails(editingTask).title}
                      </h3>
                      <p className="text-[10px] text-teal-700/80 dark:text-teal-400/80 leading-snug mt-0.5">
                        {getRenewalDetails(editingTask).helper}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-text-secondary flex items-center gap-1">
                      {getRenewalDetails(editingTask).label}
                    </label>
                    <input 
                      type="date" 
                      value={renewalDate}
                      onChange={(e) => setRenewalDate(e.target.value)}
                      className="px-3.5 py-2.5 bg-white dark:bg-gray-950 border border-teal-500/40 focus:border-teal-500 rounded-xl text-sm focus:outline-none text-text-primary w-full shadow-inner transition-colors"
                    />
                    <p className="text-[9px] text-text-tertiary italic">
                      Nota: Al ingresar esta fecha y guardar, la actividad pasará a "Completadas" y se actualizará automáticamente en el módulo correspondiente.
                    </p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 border border-border-medium text-text-secondary hover:bg-surface-hover rounded-xl text-xs font-bold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-teal-500/10 hover:shadow-teal-500/20 active:scale-95 transition"
                >
                  {isSaving ? 'Guardando...' : editingTask ? 'Guardar Cambios' : 'Programar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Excel Import Preview Modal */}
      {importPreview && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border border-border-medium/30 transform duration-300 animate-in zoom-in-95">
            <div className="p-6 border-b border-border-medium/30 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-text-primary flex items-center gap-2">
                  <Upload className="w-5 h-5 text-emerald-500" />
                  Confirmar Importación de Actividades
                </h2>
                <p className="text-xs text-text-tertiary mt-0.5">
                  Revisa las actividades detectadas en el archivo Excel antes de guardarlas.
                </p>
              </div>
              <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 rounded-full text-xs font-bold shrink-0">
                {importPreview.length} {importPreview.length === 1 ? 'Actividad' : 'Actividades'}
              </span>
            </div>

            <div className="p-6 max-h-[350px] overflow-y-auto flex flex-col gap-4">
              {importPreview.map((task, idx) => (
                <div 
                  key={idx} 
                  className="p-3.5 bg-surface-secondary/20 dark:bg-gray-950 border border-border-medium/20 rounded-2xl flex flex-col gap-1.5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="font-bold text-[13px] text-text-primary leading-tight">
                      {task.title}
                    </h4>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase shrink-0 ${
                      task.status === 'done' 
                        ? 'bg-green-50 text-green-600 dark:bg-green-950/20' 
                        : task.status === 'overdue'
                          ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/20'
                          : 'bg-gray-50 text-gray-600 dark:bg-gray-800'
                    }`}>
                      {getStatusLabel(task.status)}
                    </span>
                  </div>

                  {task.description && (
                    <p className="text-[11px] text-text-secondary line-clamp-2">
                      {task.description}
                    </p>
                  )}

                  <div className="flex items-center justify-between text-[10px] text-text-tertiary font-bold mt-1">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-text-tertiary" />
                      {formatDate(task.dueDate)}
                    </span>
                    <span className="capitalize px-1.5 py-0.5 rounded-full bg-surface-tertiary font-semibold">
                      {categoryInfo[task.type]?.label || task.type}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="p-6 border-t border-border-medium/30 flex gap-3 bg-surface-primary dark:bg-gray-900/40">
              <button
                type="button"
                onClick={() => setImportPreview(null)}
                disabled={isImporting}
                className="flex-1 py-2.5 border border-border-medium text-text-secondary hover:bg-surface-hover rounded-xl text-xs font-bold transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={isImporting}
                className="flex-1 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 active:scale-95 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {isImporting ? 'Importando...' : 'Confirmar e Importar'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* AI File Import Confirmation Modal */}
      {isConfirmAiModalOpen && pendingFileData && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-border-medium/30 transform duration-300 animate-in zoom-in-95">
            <div className="p-6 border-b border-border-medium/30">
              <h2 className="text-lg font-extrabold text-text-primary flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-500" />
                Procesar con IA
              </h2>
              <p className="text-xs text-text-tertiary mt-0.5">
                La Inteligencia Artificial extraerá automáticamente las actividades del documento.
              </p>
            </div>
            
            <div className="p-6 flex flex-col gap-4">
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center font-bold text-xs uppercase shrink-0">
                  {pendingFileData.name.split('.').pop() || 'FILE'}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-bold text-xs text-text-primary truncate">
                    {pendingFileData.name}
                  </h4>
                  <p className="text-[10px] text-text-secondary mt-0.5">
                    Listo para ser analizado
                  </p>
                </div>
              </div>
              
              <div className="text-xs text-text-secondary leading-relaxed bg-surface-secondary/20 dark:bg-gray-950 p-4 border border-border-medium/10 rounded-2xl">
                <strong>¿Cómo funciona?</strong> La IA leerá los textos, cronogramas o planes de acción que se encuentren en el documento para crear tarjetas en tu tablero con sus títulos, descripciones y fechas límites recomendadas.
              </div>
            </div>

            {/* Action Buttons */}
            <div className="p-6 border-t border-border-medium/30 flex gap-3 bg-surface-primary dark:bg-gray-900/40">
              <button
                type="button"
                onClick={() => {
                  setIsConfirmAiModalOpen(false);
                  setPendingFileData(null);
                }}
                className="flex-1 py-2.5 border border-border-medium text-text-secondary hover:bg-surface-hover rounded-xl text-xs font-bold transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmAiImport}
                className="flex-1 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 active:scale-95 transition flex items-center justify-center gap-1.5"
              >
                Comenzar Análisis IA
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Parsing Loading Screen Overlay */}
      {isAiLoading && (
        <div className="fixed inset-0 z-[999999] flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 flex flex-col items-center gap-4 max-w-sm shadow-2xl border border-border-medium/30 text-center animate-in zoom-in-95">
            <div className="relative flex items-center justify-center w-16 h-16">
              <div className="absolute inset-0 rounded-full border-4 border-emerald-500/20 animate-pulse"></div>
              <Upload className="w-7 h-7 text-emerald-500 animate-bounce" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-text-primary">
                La Inteligencia Artificial está analizando tu archivo...
              </h3>
              <p className="text-xs text-text-secondary mt-1">
                Esto puede tomar unos segundos mientras extraemos y organizamos las actividades del documento.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
