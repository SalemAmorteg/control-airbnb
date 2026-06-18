import React, { useState, useEffect } from 'react';
// 1. Importamos el cliente de Supabase
import { createClient } from '@supabase/supabase-js';

// Configura aquí tus credenciales de Supabase (o impórtalas si las tienes en otro archivo)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============ MÓDULO: CLEANING CHECK ============
const CleaningCheckModule = ({ userRole, apartments, setApartments, onLogout }) => {
  const [currentTab, setCurrentTab] = useState(userRole === 'owner' ? 'owner' : 'home');
  const [currentApartmentId, setCurrentApartmentId] = useState(null);
  const [workerName, setWorkerName] = useState('');
  const [serviceStarted, setServiceStarted] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [activeReportId, setActiveReportId] = useState(null); // Guarda el UUID generado por Supabase al iniciar
  const [dbReports, setDbReports] = useState([]);              // Almacena los reportes traídos de Supabase

  // Guardamos el ID del reporte activo en Supabase para poder actualizarlo al finalizar

  const [editingApartmentId, setEditingApartmentId] = useState(null);
  const [newApartmentName, setNewApartmentName] = useState('');
  const [editingNameId, setEditingNameId] = useState(null);
  const [editingNameValue, setEditingNameValue] = useState('');
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [selectedZoneForEdit, setSelectedZoneForEdit] = useState('kitchen');

  const zones = {
    kitchen: { name: 'Cocina', icon: '🍳' },
    bathroom: { name: 'Baño', icon: '🚿' },
    bedroom: { name: 'Habitación', icon: '🛏️' },
    common: { name: 'Área Común', icon: '🪑' }
  };

  const currentApartment = apartments.find(a => a.id === currentApartmentId);

  const formatTime = (date) => {
    return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  };

  const calculateDuration = (start, end) => {
    if (!start || !end) return '--';
    const diff = end - start;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours === 0) return `${minutes}min`;
    return `${hours}h ${minutes}min`;
  };

  // ======= ENTRADA A SUPABASE: INICIAR SERVICIO =======
  const startService = async () => {
    if (!currentApartment || !workerName.trim()) return;

    try {
      const { data, error } = await supabase
        .from('reportes_aseo')
        .insert([
          {
            apartamento: currentApartment.name,
            estado: 'En Progreso',
            checklist_zonas: currentApartment.checklist,
            inventario: currentApartment.inventory,
            completion: 0,
            novedades: `Servicio iniciado por: ${workerName}`
          }
        ])
        .select(); // El .select() es obligatorio para que nos devuelva el ID creado

      if (error) throw error;

      if (data && data.length > 0) {
        setActiveReportId(data[0].id); // Guardamos el ID retornado por Supabase
      }

      setStartTime(new Date());
      setServiceStarted(true);
      setCurrentTab('cleaning');
    } catch (error) {
      alert('Error de Supabase al iniciar servicio: ' + error.message);
    }
  };

  // ======= ACTUALIZACIÓN EN SUPABASE: FINALIZAR Y ENVIAR =======
  const submitReport = async () => {
    if (!currentApartment || !activeReportId) return;

    const now = new Date();
    const completion = calculateCompletionPercentage();
    const duration = calculateDuration(startTime, now);
    const notes = completion === 100 ? 'Limpieza completada al 100%' : 'Limpieza parcial';

    try {
      const { error } = await supabase
        .from('reportes_aseo')
        .update({
          estado: 'Completado',
          checklist_zonas: currentApartment.checklist, // Envía el JSON final de las tareas
          inventario: currentApartment.inventory,       // Envía el JSON final de insumos
          completion: completion,                      // Guarda el número del progreso real (ej: 85)
          novedades: `Trabajador: ${workerName} | Duración: ${duration} | Nota: ${notes}`
        })
        .eq('id', activeReportId); // Modifica SOLAMENTE la fila que abrimos al iniciar

      if (error) throw error;

      // Reseteamos estados locales para dejar la app limpia para el siguiente turno
      setServiceStarted(false);
      setStartTime(null);
      setWorkerName('');
      setCurrentApartmentId(null);
      setActiveReportId(null);

      alert(`✓ Reporte enviado con éxito\nAseo: ${currentApartment.name}\nDuración total: ${duration}`);
    } catch (error) {
      alert('Error de Supabase al enviar reporte final: ' + error.message);
    }
  };

  const resetChecklist = (checklist) => {
    const reset = {};
    Object.keys(checklist).forEach(zone => {
      reset[zone] = {};
      Object.keys(checklist[zone]).forEach(item => {
        reset[zone][item] = false;
      });
    });
    return reset;
  };

  const calculateCompletionPercentage = () => {
    if (!currentApartment) return 0;
    const totalItems = Object.values(currentApartment.checklist).reduce((sum, zone) => sum + Object.keys(zone).length, 0);
    const completedItems = Object.values(currentApartment.checklist).reduce((sum, zone) =>
      sum + Object.values(zone).filter(Boolean).length, 0
    );
    return totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  };

  const toggleChecklistItem = (zone, item) => {
    setApartments(prev => prev.map(apt => {
      if (apt.id === currentApartmentId) {
        return {
          ...apt,
          checklist: {
            ...apt.checklist,
            [zone]: {
              ...apt.checklist[zone],
              [item]: !apt.checklist[zone][item]
            }
          }
        };
      }
      return apt;
    }));
  };

  const updateInventory = (key, amount) => {
    setApartments(prev => prev.map(apt => {
      if (apt.id === currentApartmentId) {
        return {
          ...apt,
          inventory: {
            ...apt.inventory,
            [key]: {
              ...apt.inventory[key],
              current: Math.max(0, apt.inventory[key].current + amount)
            }
          }
        };
      }
      return apt;
    }));
  };

  const createApartment = () => {
    if (!newApartmentName.trim()) return;
    const newId = Math.max(...apartments.map(a => a.id), 0) + 1;
    const newApartment = {
      id: newId,
      name: newApartmentName,
      checklist: { kitchen: {}, bathroom: {}, bedroom: {}, common: {} },
      inventory: {},
      reports: []
    };
    setApartments([...apartments, newApartment]);
    setNewApartmentName('');
  };

  const updateApartmentName = (apartmentId, newName) => {
    if (!newName.trim()) return;
    setApartments(prev => prev.map(apt => {
      if (apt.id === apartmentId) {
        return { ...apt, name: newName };
      }
      return apt;
    }));
    setEditingNameId(null);
    setEditingNameValue('');
  };

  const addChecklistItem = (apartmentId) => {
    if (!newChecklistItem.trim()) return;
    setApartments(prev => prev.map(apt => {
      if (apt.id === apartmentId) {
        return {
          ...apt,
          checklist: {
            ...apt.checklist,
            [selectedZoneForEdit]: {
              ...apt.checklist[selectedZoneForEdit],
              [newChecklistItem]: false
            }
          }
        };
      }
      return apt;
    }));
    setNewChecklistItem('');
  };

  const deleteChecklistItem = (apartmentId, zone, item) => {
    setApartments(prev => prev.map(apt => {
      if (apt.id === apartmentId) {
        const updatedZone = { ...apt.checklist[zone] };
        delete updatedZone[item];
        return {
          ...apt,
          checklist: {
            ...apt.checklist,
            [zone]: updatedZone
          }
        };
      }
      return apt;
    }));
  };

  const deleteApartment = (apartmentId) => {
    setApartments(prev => prev.filter(apt => apt.id !== apartmentId));
    if (currentApartmentId === apartmentId) {
      setCurrentApartmentId(null);
    }
  };

  const elapsedTime = startTime ? calculateDuration(startTime, new Date()) : '--';
  const completionPercentage = calculateCompletionPercentage();

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', overflow: 'auto', borderBottom: '1px solid #e0e0e0', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
        {userRole === 'employee' && (
          <>
            <button onClick={() => { setCurrentTab('home'); if (serviceStarted) setServiceStarted(false); }} style={{ padding: '0.5rem 1rem', backgroundColor: currentTab === 'home' ? '#f5f5f5' : 'transparent', border: 'none', borderBottom: currentTab === 'home' ? '2px solid #3b82f6' : 'none', color: '#1a1a1a', fontSize: '13px', fontWeight: currentTab === 'home' ? 500 : 400, cursor: 'pointer', whiteSpace: 'nowrap' }}>🏠 Inicio</button>
            <button onClick={() => setCurrentTab('cleaning')} disabled={!serviceStarted} style={{ padding: '0.5rem 1rem', color: !serviceStarted ? '#cccccc' : '#1a1a1a', opacity: serviceStarted ? 1 : 0.5, whiteSpace: 'nowrap', border: 'none', borderBottom: currentTab === 'cleaning' ? '2px solid #3b82f6' : 'none', backgroundColor: currentTab === 'cleaning' ? '#f5f5f5' : 'transparent', fontSize: '13px', fontWeight: currentTab === 'cleaning' ? 500 : 400, cursor: serviceStarted ? 'pointer' : 'not-allowed' }}>🧹 Aseo</button>
          </>
        )}
        {userRole === 'owner' && (
          <>
            <button onClick={() => setCurrentTab('owner')} style={{ padding: '0.5rem 1rem', backgroundColor: currentTab === 'owner' ? '#f5f5f5' : 'transparent', border: 'none', borderBottom: currentTab === 'owner' ? '2px solid #3b82f6' : 'none', color: '#1a1a1a', fontSize: '13px', fontWeight: currentTab === 'owner' ? 500 : 400, cursor: 'pointer', whiteSpace: 'nowrap' }}>📋 Reportes</button>
            <button onClick={() => setCurrentTab('config')} style={{ padding: '0.5rem 1rem', backgroundColor: currentTab === 'config' ? '#f5f5f5' : 'transparent', border: 'none', borderBottom: currentTab === 'config' ? '2px solid #3b82f6' : 'none', color: '#1a1a1a', fontSize: '13px', fontWeight: currentTab === 'config' ? 500 : 400, cursor: 'pointer', whiteSpace: 'nowrap' }}>⚙️ Config</button>
          </>
        )}
      </div>

      {/* CONTENIDO */}
      <div style={{ maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>
        {/* EMPLOYEE - HOME */}
        {userRole === 'employee' && currentTab === 'home' && !serviceStarted && (
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '1rem' }}>📍 Selecciona un apartamento</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
              {apartments.map(apt => (
                <div key={apt.id} onClick={() => setCurrentApartmentId(apt.id)} style={{ backgroundColor: currentApartmentId === apt.id ? '#ecfdf5' : '#ffffff', border: currentApartmentId === apt.id ? '2px solid #10b981' : '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem', cursor: 'pointer', transition: 'all 0.2s' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 0.5rem 0' }}>{apt.name}</h3>
                  <p style={{ fontSize: '12px', color: '#666666', margin: '0' }}>Items: {Object.keys(apt.inventory).length}</p>
                </div>
              ))}
            </div>

            {currentApartmentId && (
              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1.5rem' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 1rem 0' }}>👤 Datos del trabajador</h3>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '0.5rem' }}>Tu nombre</label>
                  <input type="text" value={workerName} onChange={(e) => setWorkerName(e.target.value)} placeholder="Ej: María García" style={{ width: '100%', padding: '0.75rem', border: '1px solid #d0d0d0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
                </div>
                <button onClick={startService} disabled={!currentApartmentId || !workerName} style={{ width: '100%', padding: '0.75rem', backgroundColor: (currentApartmentId && workerName) ? '#10b981' : '#cccccc', color: '#ffffff', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 600, cursor: (currentApartmentId && workerName) ? 'pointer' : 'not-allowed' }}>▶️ Iniciar servicio</button>
              </div>
            )}
          </div>
        )}

        {/* EMPLOYEE - CLEANING */}
        {userRole === 'employee' && currentTab === 'cleaning' && serviceStarted && currentApartment && (
          <div>
            <h2 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '1rem' }}>📋 Checklist de aseo</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
              {Object.entries(zones).map(([zoneKey, zone]) => (
                <div key={zoneKey} style={{ backgroundColor: '#ffffff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem' }}>
                  <p style={{ fontSize: '14px', fontWeight: 500, margin: '0 0 0.75rem 0' }}>{zone.icon} {zone.name}</p>
                  {Object.entries(currentApartment.checklist[zoneKey] || {}).map(([item, completed]) => (
                    <label key={item} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '13px', marginBottom: '0.5rem' }}>
                      <input type="checkbox" checked={completed} onChange={() => toggleChecklistItem(zoneKey, item)} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#10b981' }} />
                      <span style={{ textDecoration: completed ? 'line-through' : 'none', color: completed ? '#999999' : '#1a1a1a' }}>{item}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>

            {/* Inventario */}
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 500, margin: '0 0 1rem 0' }}>📊 Inventario</h2>
              {Object.entries(currentApartment.inventory).map(([key, item]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyBaycontent: 'space-between', padding: '0.75rem', backgroundColor: '#f5f5f5', borderRadius: '6px', gap: '1rem', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                    <span style={{ fontSize: '18px' }}>{item.icon}</span>
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>{item.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button onClick={() => updateInventory(key, -1)} style={{ width: '28px', height: '28px', border: '1px solid #d0d0d0', backgroundColor: '#ffffff', borderRadius: '6px', cursor: 'pointer', fontSize: '16px' }}>−</button>
                    <span style={{ fontSize: '15px', fontWeight: 600, minWidth: '24px', textAlign: 'center' }}>{item.current}</span>
                    <button onClick={() => updateInventory(key, 1)} style={{ width: '28px', height: '28px', border: '1px solid #d0d0d0', backgroundColor: '#ffffff', borderRadius: '6px', cursor: 'pointer', fontSize: '16px' }}>+</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Progreso y Fin */}
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem' }}>
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyBaycontent: 'space-between', marginBottom: '0.5rem' }}><span style={{ fontSize: '13px', fontWeight: 500 }}>Progreso</span><span style={{ fontSize: '14px', fontWeight: 600, color: '#10b981' }}>{completionPercentage}%</span></div>
                <div style={{ width: '100%', height: '6px', backgroundColor: '#f0f0f0', borderRadius: '6px', overflow: 'hidden' }}><div style={{ height: '100%', width: `${completionPercentage}%`, backgroundColor: '#10b981' }} /></div>
              </div>
              <button onClick={submitReport} style={{ width: '100%', padding: '0.75rem', backgroundColor: '#3b82f6', color: '#ffffff', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>✓ Finalizar y enviar reporte</button>
            </div>
          </div>
        )}

        {/* OWNER - REPORTES */}
        {userRole === 'owner' && currentTab === 'owner' && (
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '1.5rem' }}>📋 Reportes de Aseos</h2>
            {apartments.length === 0 ? (
              <div style={{ backgroundColor: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '8px', padding: '1rem', textAlign: 'center' }}>
                <p style={{ fontSize: '13px', color: '#92400e', margin: 0 }}>No hay apartamentos</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                {apartments.map(apt => {
                  // 1. FILTRADO RECOMIENDA: Buscamos en los reportes de Supabase los que correspondan a este apartamento
                  const aptReports = dbReports.filter(r => r.apartamento === apt.name);

                  return (
                    <div key={apt.id} style={{ backgroundColor: '#ffffff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem' }}>
                      <h3 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 1rem 0', color: '#1a1a1a' }}>{apt.name}</h3>

                      {/* 2. CAMBIO: Evaluamos el tamaño de los reportes traídos de la base de datos */}
                      {aptReports.length === 0 ? (
                        <p style={{ fontSize: '13px', color: '#999999', textAlign: 'center', padding: '1rem 0', margin: 0 }}>Sin reportes</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          {aptReports.slice(0, 5).map((report, idx) => (
                            <div
                              key={report.id || idx}
                              style={{
                                padding: '0.75rem',
                                backgroundColor: '#f5f5f5',
                                borderRadius: '6px',
                                borderLeft: `3px solid ${report.estado === 'En Progreso' ? '#3b82f6' : (report.completion === 100 ? '#10b981' : '#f59e0b')}`,
                                fontSize: '12px'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                <strong>{new Date(report.created_at).toLocaleDateString('es-CO')}</strong>
                                <span style={{ color: report.estado === 'En Progreso' ? '#3b82f6' : (report.completion === 100 ? '#10b981' : '#f59e0b'), fontWeight: 600 }}>
                                  {report.completion}%
                                </span>
                              </div>

                              {/* 3. MEJORA: Mostramos el texto consolidado de novedades (Trabajador, Duración, Notas) */}
                              <p style={{ margin: '0.25rem 0', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.25rem', color: '#333333', lineHeight: '1.4' }}>
                                📝 {report.novedades || 'Sin detalles registrados'}

                                {/* BADGE EN TIEMPO REAL SI EL EMPLEADO ESTÁ LIMPIANDO EN ESE INSTANTE */}
                                {report.estado === 'En Progreso' && (
                                  <span style={{ backgroundColor: '#dbeafe', color: '#1e40af', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>
                                    🔄 En Progreso
                                  </span>
                                )}
                              </p>

                              {/* 4. ALINEACIÓN: Mostramos la hora exacta del movimiento y el estado actual */}
                              <div style={{ fontSize: '11px', color: '#666666', marginTop: '0.5rem', borderTop: '1px dashed #e0e0e0', paddingTop: '0.25rem' }}>
                                🕒 <b>Hora registro:</b> {new Date(report.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })} | <b>Estado:</b> {report.estado}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* OWNER - CONFIG */}
        {userRole === 'owner' && currentTab === 'config' && (
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '1rem' }}>⚙️ Configuración</h2>
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 1rem 0' }}>➕ Nuevo apartamento</h3>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <input type="text" value={newApartmentName} onChange={(e) => setNewApartmentName(e.target.value)} placeholder="Ej: Apartamento C" style={{ flex: 1, padding: '0.75rem', border: '1px solid #d0d0d0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
                <button onClick={createApartment} disabled={!newApartmentName.trim()} style={{ padding: '0.75rem 1.5rem', backgroundColor: newApartmentName.trim() ? '#3b82f6' : '#cccccc', color: '#ffffff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: newApartmentName.trim() ? 'pointer' : 'not-allowed' }}>Crear</button>
              </div>
            </div>
            <h3 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 1rem 0' }}>📍 Mis Apartamentos</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
              {apartments.map(apt => (
                <div key={apt.id} style={{ backgroundColor: '#ffffff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem' }}>
                  {editingNameId === apt.id ? (
                    <div style={{ marginBottom: '1rem' }}>
                      <input type="text" value={editingNameValue} onChange={(e) => setEditingNameValue(e.target.value)} placeholder="Nuevo nombre" style={{ width: '100%', padding: '0.5rem', border: '1px solid #d0d0d0', borderRadius: '6px', fontSize: '13px', marginBottom: '0.5rem', boxSizing: 'border-box' }} />
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => updateApartmentName(apt.id, editingNameValue)} style={{ flex: 1, padding: '0.5rem', backgroundColor: '#10b981', color: '#ffffff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>Guardar</button>
                        <button onClick={() => { setEditingNameId(null); setEditingNameValue(''); }} style={{ flex: 1, padding: '0.5rem', backgroundColor: '#f0f0f0', color: '#1a1a1a', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h4 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 0.75rem 0', color: '#1a1a1a' }}>{apt.name}</h4>
                      <p style={{ fontSize: '12px', color: '#666666', margin: '0 0 1rem 0' }}>Items: {Object.keys(apt.inventory).length} | Reportes: {apt.reports.length}</p>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => { setEditingNameId(apt.id); setEditingNameValue(apt.name); }} style={{ flex: 1, padding: '0.5rem', backgroundColor: '#f0f4ff', color: '#3b82f6', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>✏️ Editar</button>
                        <button onClick={() => { if (window.confirm(`¿Eliminar ${apt.name}?`)) { deleteApartment(apt.id); } }} style={{ flex: 1, padding: '0.5rem', backgroundColor: '#fecaca', color: '#991b1b', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>🗑️</button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============ MÓDULO: REVENUE ANALYSIS (PLACEHOLDER) ============
const RevenueAnalysisModule = ({ onLogout }) => {
  return (
    <div style={{ backgroundColor: '#ffffff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '3rem', textAlign: 'center', maxWidth: '600px', margin: '2rem auto' }}>
      <div style={{ fontSize: '48px', marginBottom: '1rem' }}>📊</div>
      <h2 style={{ fontSize: '24px', fontWeight: 600, margin: '0 0 1rem 0', color: '#1a1a1a' }}>Revenue Analysis</h2>
      <p style={{ fontSize: '14px', color: '#666666', margin: '0 0 2rem 0', lineHeight: 1.6 }}>Este módulo está en desarrollo. Aquí se incluirán análisis de ingresos, reportes de ocupación, métricas de desempeño y más.</p>
      <div style={{ backgroundColor: '#f0f4ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '1.5rem' }}>
        <p style={{ fontSize: '13px', color: '#1e40af', margin: 0, lineHeight: 1.6 }}><strong>Estado:</strong> Próximos pasos<br />• Integración con datos de ocupación<br />• Cálculos de ingresos por propiedad<br />• Gráficas de tendencias<br />• Reportes exportables</p>
      </div>
    </div>
  );
};

// ============ APP PRINCIPAL ============
const CleanCheckRPM = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [currentModule, setCurrentModule] = useState('cleaning-check');

  const [apartments, setApartments] = useState([
    {
      id: 1,
      name: 'Apartamento A',
      checklist: {
        kitchen: { 'Pisos limpios': false, 'Encimera desinfectada': false, 'Fregadero lavado': false, 'Electrodomésticos secos': false },
        bathroom: { 'Ducha/Bañera limpia': false, 'Espejo desempañado': false, 'Grifo pulido': false, 'Piso secar': false },
        bedroom: { 'Cama tendida': false, 'Piso barrido': false, 'Superficies sin polvo': false, 'Ventanas limpias': false },
        common: { 'Sofá aspirado': false, 'Mesitas limpias': false, 'Basura retirada': false, 'Aire fresco': false }
      },
      inventory: {
        towels: { label: 'Toallas limpias', icon: '🏖️', min: 5, current: 8 },
        toilet_paper: { label: 'Papel higiénico', icon: '📄', min: 8, current: 12 },
        soap_shampoo: { label: 'Jabón/Shampoo', icon: '🧴', min: 3, current: 5 },
        coffee_water: { label: 'Café/Agua', icon: '☕', min: 6, current: 10 }
      },
      reports: [] // Inicializado vacío para recibir datos desde Supabase
    }
  ]);

  const credentials = {
    employee: { username: 'aseo', password: '1234' },
    owner: { username: 'propietario', password: '1234' }
  };

  useEffect(() => {
    document.title = 'Clean Check RPM - Revenue Property Management';
  }, []);

  // =========================================================
  //  HOOK CRUCIAL: CARGA INICIAL Y ESCUCHA EN TIEMPO REAL
  // =========================================================
  useEffect(() => {
    // A. Descargar el histórico de reportes existentes al abrir la app
    const syncInitialData = async () => {
      const { data, error } = await supabase
        .from('reportes_aseo')
        .select('*')
        .order('id', { ascending: false }); // Los más recientes primero

      if (!error && data) {
        setApartments(prev => prev.map(apt => {
          // Filtramos y transformamos las columnas snake_case de Postgres a tu camelCase de UI
          const filtrados = data
            .filter(row => row.apartamento === apt.name)
            .map(row => ({
              id: row.id,
              date: row.date || row.created_at?.split('T')[0],
              startTime: row.start_time,
              endTime: row.end_time,
              duration: row.duration,
              completion: row.completion,
              workerName: row.worker_name,
              notes: row.notes,
              estado: row.estado
            }));
          return { ...apt, reports: filtrados };
        }));
      }
    };

    syncInitialData();

    // B. Suscripción por WebSockets (Realtime) habilitada para cualquier cambio (* INSERT/UPDATE)
    const realtimeChannel = supabase
      .channel('room-reportes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reportes_aseo' },
        (payload) => {
          const row = payload.new;

          // Evento 1: Cuando el empleado le da a "Iniciar Servicio" (INSERT)
          if (payload.eventType === 'INSERT') {
            setApartments(prev => prev.map(apt => {
              if (apt.name === row.apartamento) {
                const yaExiste = apt.reports.some(r => r.id === row.id);
                if (yaExiste) return apt;

                const nuevoReporte = {
                  id: row.id,
                  date: row.date,
                  startTime: row.start_time,
                  endTime: row.end_time,
                  duration: row.duration,
                  completion: row.completion,
                  workerName: row.worker_name,
                  notes: row.notes,
                  estado: row.estado
                };
                return { ...apt, reports: [nuevoReporte, ...apt.reports] };
              }
              return apt;
            }));
          }

          // Evento 2: Cuando el empleado le da a "Finalizar" (UPDATE)
          if (payload.eventType === 'UPDATE') {
            setApartments(prev => prev.map(apt => {
              if (apt.name === row.apartamento) {
                return {
                  ...apt,
                  reports: apt.reports.map(r => r.id === row.id ? {
                    id: row.id,
                    date: row.date,
                    startTime: row.start_time,
                    endTime: row.end_time,
                    duration: row.duration,
                    completion: row.completion,
                    workerName: row.worker_name,
                    notes: row.notes,
                    estado: row.estado
                  } : r)
                };
              }
              return apt;
            }));
          }
        }
      )
      .subscribe();

    // Cleanup: Desconectar el canal Realtime al desmontar la app
    return () => {
      supabase.removeChannel(realtimeChannel);
    };
  }, []);

  const handleLogin = (role) => {
    if (loginUsername === credentials[role].username && loginPassword === credentials[role].password) {
      setIsLoggedIn(true);
      setUserRole(role);
      setLoginUsername('');
      setLoginPassword('');
      setCurrentModule('cleaning-check');
    } else {
      alert('Usuario o contraseña incorrectos');
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUserRole(null);
    setLoginUsername('');
    setLoginPassword('');
    setCurrentModule('cleaning-check');
  };

  if (!isLoggedIn) {
    return (
      <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', backgroundColor: '#f8f8f8', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyBaycontent: 'center', padding: '1rem' }}>
        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', padding: '2rem', maxWidth: '400px', width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ fontSize: '48px', marginBottom: '1rem' }}>✓</div>
            <h1 style={{ fontSize: '28px', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#1a1a1a' }}>Clean Check RPM</h1>
            <p style={{ fontSize: '14px', color: '#666666', margin: 0 }}>Revenue Property Management System</p>
          </div>
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '0.5rem', color: '#1a1a1a' }}>Usuario</label>
              <input type="text" value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleLogin('employee')} placeholder="Ingresa tu usuario" style={{ width: '100%', padding: '0.75rem', border: '1px solid #d0d0d0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '0.5rem', color: '#1a1a1a' }}>Contraseña</label>
              <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleLogin('employee')} placeholder="Ingresa tu contraseña" style={{ width: '100%', padding: '0.75rem', border: '1px solid #d0d0d0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <button onClick={() => handleLogin('employee')} style={{ padding: '0.75rem', backgroundColor: '#3b82f6', color: '#ffffff', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>🧹 Empleado</button>
              <button onClick={() => handleLogin('owner')} style={{ padding: '0.75rem', backgroundColor: '#10b981', color: '#ffffff', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>👤 Propietario</button>
            </div>
          </div>
          <div style={{ backgroundColor: '#f0f4ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '1rem', fontSize: '12px', color: '#1e40af' }}>
            <strong>Credenciales de demo:</strong>
            <div style={{ marginTop: '0.5rem', lineHeight: 1.6 }}>
              <div>🧹 Empleado: <code style={{ backgroundColor: '#ffffff', padding: '0.25rem 0.5rem', borderRadius: '3px', fontFamily: 'monospace' }}>aseo / 1234</code></div>
              <div>👤 Propietario: <code style={{ backgroundColor: '#ffffff', padding: '0.25rem 0.5rem', borderRadius: '3px', fontFamily: 'monospace' }}>propietario / 1234</code></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', backgroundColor: '#f8f8f8', minHeight: '100vh', padding: '0' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e0e0e0', padding: '1rem', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyBaycontent: 'space-between', marginBottom: userRole === 'owner' ? '1rem' : '0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '24px' }}>✓</span>
            <div>
              <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0', color: '#1a1a1a' }}>Clean Check RPM</h1>
              <p style={{ fontSize: '12px', color: '#666666', margin: '0.25rem 0 0 0' }}>{userRole === 'employee' ? '🧹 Empleado' : '👤 Propietario'}</p>
            </div>
          </div>
          <button onClick={handleLogout} style={{ padding: '0.5rem 1rem', backgroundColor: '#fecaca', color: '#991b1b', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>Cerrar sesión</button>
        </div>

        {userRole === 'owner' && (
          <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid #e0e0e0', paddingBottom: '0.75rem' }}>
            <button onClick={() => setCurrentModule('cleaning-check')} style={{ padding: '0.5rem 1rem', backgroundColor: currentModule === 'cleaning-check' ? '#f5f5f5' : 'transparent', border: 'none', borderBottom: currentModule === 'cleaning-check' ? '2px solid #3b82f6' : 'none', color: '#1a1a1a', fontSize: '14px', fontWeight: currentModule === 'cleaning-check' ? 600 : 400, cursor: 'pointer', whiteSpace: 'nowrap' }}>🧹 Cleaning Check</button>
            <button onClick={() => setCurrentModule('revenue-analysis')} style={{ padding: '0.5rem 1rem', backgroundColor: currentModule === 'revenue-analysis' ? '#f5f5f5' : 'transparent', border: 'none', borderBottom: currentModule === 'revenue-analysis' ? '2px solid #3b82f6' : 'none', color: '#1a1a1a', fontSize: '14px', fontWeight: currentModule === 'revenue-analysis' ? 600 : 400, cursor: 'pointer', whiteSpace: 'nowrap' }}>📊 Revenue Analysis</button>
          </div>
        )}
      </div>

      <div style={{ padding: '1rem' }}>
        {currentModule === 'cleaning-check' && (
          <CleaningCheckModule userRole={userRole} apartments={apartments} setApartments={setApartments} onLogout={handleLogout} />
        )}
        {currentModule === 'revenue-analysis' && userRole === 'owner' && (
          <RevenueAnalysisModule onLogout={handleLogout} />
        )}
      </div>
    </div>
  );
};

export default CleanCheckRPM;