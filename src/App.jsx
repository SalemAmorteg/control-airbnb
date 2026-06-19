import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

// ============ MÓDULO: CLEANING CHECK ============
const CleaningCheckModule = ({ userRole, apartments, setApartments, onLogout }) => {
  const [currentTab, setCurrentTab] = useState(userRole === 'owner' ? 'owner' : 'home');
  const [currentApartmentId, setCurrentApartmentId] = useState(null);
  const [workerName, setWorkerName] = useState('');
  const [serviceStarted, setServiceStarted] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [activeReportId, setActiveReportId] = useState(null);

  // Estados para editar inventario
  const [editingInventoryId, setEditingInventoryId] = useState(null);
  const [editingInventoryApartmentId, setEditingInventoryApartmentId] = useState(null);

  const [editingApartmentId, setEditingApartmentId] = useState(null);
  const [newApartmentName, setNewApartmentName] = useState('');
  const [editingNameId, setEditingNameId] = useState(null);
  const [editingNameValue, setEditingNameValue] = useState('');
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [selectedZoneForEdit, setSelectedZoneForEdit] = useState('kitchen');
  const [newInvLabel, setNewInvLabel] = useState('');
  const [newInvIcon, setNewInvIcon] = useState('📦');
  const [newInvMin, setNewInvMin] = useState('5');
  const [newInvCurrent, setNewInvCurrent] = useState('5');

  const [dbReports, setDbReports] = useState([]);
  const [isLoadingReports, setIsLoadingReports] = useState(false);

  const zones = {
    kitchen: { name: 'Cocina', icon: '🍳' },
    bathroom: { name: 'Baño', icon: '🚿' },
    bedroom: { name: 'Habitación', icon: '🛏️' },
    common: { name: 'Área Común', icon: '🪑' }
  };

  const currentApartment = apartments.find(a => a.id === currentApartmentId);

  // ===== SINCRONIZACIÓN DE INVENTARIO =====

  useEffect(() => {
    const fetchApartmentsFromDB = async () => {
      const { data, error } = await supabase.from('apartamentos').select('*');
      if (data) {
        setApartments(data);
      }
    };

    fetchApartmentsFromDB();

    // Suscripción a cambios en tiempo real (INSERT y DELETE)
    const channel = supabase
      .channel('public:apartamentos')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'apartamentos' }, // El '*' escucha todos los cambios
        (payload) => {
          console.log('Cambio detectado:', payload);
          fetchApartmentsFromDB(); // Esto refresca la lista automáticamente
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [setApartments]);

  useEffect(() => {
    if (userRole === 'employee' && currentApartmentId) {
      // Cargar inventario inicial desde Supabase
      loadInventoryFromSupabase();

      // Suscribirse a cambios en tiempo real
      const channel = supabase
        .channel(`inventory_${currentApartmentId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'inventario',
            filter: `apartamento_id=eq.${currentApartmentId}`
          },
          (payload) => {
            loadInventoryFromSupabase();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [userRole, currentApartmentId]);

  const loadInventoryFromSupabase = async () => {
    if (!currentApartmentId) return;

    try {
      const { data, error } = await supabase
        .from('inventario')
        .select('*')
        .eq('apartamento_id', currentApartmentId);

      if (error) throw error;

      if (data && data.length > 0) {
        // Convertir datos de Supabase a formato local
        const inventoryFromDb = {};
        data.forEach(item => {
          inventoryFromDb[item.item_key] = {
            label: item.label,
            icon: item.icon,
            min: item.stock_minimo,
            current: item.stock_actual
          };
        });

        // Actualizar el apartamento con el inventario de Supabase
        setApartments(prev =>
          prev.map(apt =>
            apt.id === currentApartmentId
              ? { ...apt, inventory: inventoryFromDb }
              : apt
          )
        );
      }
    } catch (err) {
      console.error('Error cargando inventario desde Supabase:', err.message);
    }
  };


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

  // Cargar reportes desde Supabase
  useEffect(() => {
    if (userRole === 'owner' && currentTab === 'owner') {
      fetchReportsFromSupabase();

      const realtimeChannel = supabase
        .channel('owner_live_reports')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reportes_aseo' }, () => {
          fetchReportsFromSupabase();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(realtimeChannel);
      };
    }
  }, [userRole, currentTab]);

  const fetchReportsFromSupabase = async () => {
    setIsLoadingReports(true);
    try {
      const { data, error } = await supabase
        .from('reportes_aseo')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDbReports(data || []);
    } catch (err) {
      console.error('Error cargando reportes de Supabase:', err.message);
    } finally {
      setIsLoadingReports(false);
    }
  };

  const startService = async () => {
    if (!currentApartment || !workerName.trim()) return;

    try {
      const { data, error } = await supabase
        .from('reportes_aseo')
        .insert([{
          apartamento: currentApartment.name,
          estado: 'En Progreso',
          checklist_zonas: currentApartment.checklist,
          inventario: currentApartment.inventory,
          completion: 0,
          novedades: `Servicio iniciado por: ${workerName}`
        }])
        .select();

      if (error) throw error;

      if (data && data.length > 0) {
        setActiveReportId(data[0].id);
      }

      setStartTime(new Date());
      setServiceStarted(true);
      setCurrentTab('cleaning');
    } catch (error) {
      alert('Error al conectar con Supabase: ' + error.message);
    }
  };

  const submitReport = async () => {
    if (!currentApartment || !activeReportId) return;

    const now = new Date();
    const completion = calculateCompletionPercentage();
    const duration = calculateDuration(startTime, now);
    const notes = completion === 100 ? 'Limpieza completada al 100%' : 'Limpieza parcial';

    // 1. NUEVO: Revisar qué ítems quedaron por debajo del mínimo
    const lowStockItems = Object.values(currentApartment.inventory || {}).filter(item => {
      // Usamos Number() para evitar el error matemático de texto vs texto
      const actual = Number(item.stock_actual ?? item.current ?? 0);
      const minimo = Number(item.stock_minimo ?? item.min ?? 0);
      return actual < minimo;
    });

    // 2. NUEVO: Construir el texto de advertencia si hay faltantes
    const alertasStock = lowStockItems.length > 0
      ? ` | ⚠️ FALTAN INSUMOS: ${lowStockItems.map(i => i.label).join(', ')}`
      : '';

    try {
      const { error } = await supabase
        .from('reportes_aseo')
        .update({
          estado: 'Completado',
          checklist_zonas: currentApartment.checklist,
          inventario: currentApartment.inventory,
          completion: completion,
          // 3. Añadimos alertasStock al final de las novedades
          novedades: `Trabajador: ${workerName} | Duración: ${duration} | Nota: ${notes}${alertasStock}`
        })
        .eq('id', activeReportId);

      if (error) throw error;

      setApartments(prev => prev.map(apt => {
        if (apt.id === currentApartmentId) {
          return { ...apt, checklist: resetChecklist(apt.checklist) };
        }
        return apt;
      }));

      setServiceStarted(false);
      setStartTime(null);
      setWorkerName('');
      setCurrentApartmentId(null);
      setActiveReportId(null);

      alert(`✓ Reporte enviado\nAseo: ${currentApartment.name}\nDuración: ${duration}`);
    } catch (error) {
      alert('Error al cerrar reporte en Supabase: ' + error.message);
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

  const calculateCompletionPercentage = (apt = currentApartment) => {
    if (!apt) return 0;
    const totalItems = Object.values(apt.checklist).reduce((sum, zone) => sum + Object.keys(zone).length, 0);
    const completedItems = Object.values(apt.checklist).reduce((sum, zone) =>
      sum + Object.values(zone).filter(Boolean).length, 0
    );
    return totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  };

  const toggleChecklistItem = async (zone, item) => {
    const updatedApt = {
      ...currentApartment,
      checklist: {
        ...currentApartment.checklist,
        [zone]: {
          ...currentApartment.checklist[zone],
          [item]: !currentApartment.checklist[zone][item]
        }
      }
    };

    setApartments(prev => prev.map(apt => apt.id === currentApartmentId ? updatedApt : apt));

    if (serviceStarted && activeReportId) {
      const newCompletion = calculateCompletionPercentage(updatedApt);

      try {
        await supabase
          .from('reportes_aseo')
          .update({
            checklist_zonas: updatedApt.checklist,
            completion: newCompletion
          })
          .eq('id', activeReportId);
      } catch (err) {
        console.error('Error actualizando progreso:', err);
      }
    }
  };

  const createApartment = async () => {
    if (!newApartmentName.trim()) return;

    const newApt = {
      name: newApartmentName,
      checklist: { kitchen: {}, bedroom: {}, bathroom: {} }, // Estructura base
      inventory: {} // Comienza vacío
    };

    const { data, error } = await supabase
      .from('apartamentos')
      .insert([newApt])
      .select();

    if (error) {
      console.error("Error al crear:", error);
      return;
    }

    setApartments([...apartments, data[0]]);
    setNewApartmentName('');
  };

  const updateApartmentName = async (id, newName) => {
    // 1. El UPDATE a Supabase es el que realmente cambia la base de datos
    const { data, error } = await supabase
      .from('apartamentos')
      .update({ name: newName }) // Aquí va el campo a actualizar
      .eq('id', id);            // IMPORTANTE: Filtrar por el ID correcto

    if (error) {
      console.error("Error al actualizar en BD:", error);
      return;
    }

    // 2. Opcional: Solo si el Realtime falla, actualizamos el estado local manualmente.
    // Pero si el Realtime está bien, esto debería ser redundante.
    setApartments(prev => prev.map(apt =>
      apt.id === id ? { ...apt, name: newName } : apt
    ));

    alert('Nombre actualizado correctamente');
  };

  const addChecklistItem = async (apartmentId, zone) => {
    if (!newChecklistItem.trim()) return;

    const apt = apartments.find(a => a.id === apartmentId);
    if (!apt) return;

    // 1. Preparamos el objeto actualizado
    // Aseguramos que la zona exista y añadimos el nuevo ítem en false
    const updatedChecklist = {
      ...apt.checklist,
      [zone]: {
        ...(apt.checklist[zone] || {}),
        [newChecklistItem.trim()]: false
      }
    };

    // 2. Actualizamos en Supabase (Persistencia)
    const { error } = await supabase
      .from('apartamentos')
      .update({ checklist: updatedChecklist })
      .eq('id', apartmentId);

    if (error) {
      console.error("Error al guardar tarea en BD:", error);
      alert("No se pudo guardar la tarea");
      return;
    }

    // 3. Actualizamos el estado local para refrescar la UI
    setApartments(prev => prev.map(a =>
      a.id === apartmentId ? { ...a, checklist: updatedChecklist } : a
    ));

    // 4. Limpiamos el input
    setNewChecklistItem('');
  };

  const deleteChecklistItem = async (apartmentId, zone, taskName) => {
    const apt = apartments.find(a => a.id === apartmentId);
    if (!apt) return;

    // 1. Crear una copia de la zona y eliminar la tarea
    const updatedZone = { ...apt.checklist[zone] };
    delete updatedZone[taskName]; // Eliminamos la tarea del objeto

    // 2. Construir el objeto completo de checklist
    const updatedChecklist = {
      ...apt.checklist,
      [zone]: updatedZone
    };

    // 3. Persistir en Supabase
    const { error } = await supabase
      .from('apartamentos')
      .update({ checklist: updatedChecklist })
      .eq('id', apartmentId);

    if (error) {
      console.error("Error al eliminar tarea en BD:", error);
      return;
    }

    // 4. Actualizar estado local
    setApartments(prev => prev.map(a =>
      a.id === apartmentId ? { ...a, checklist: updatedChecklist } : a
    ));
  };

  const addInventoryItem = async (apartmentId) => {
    if (!newInvLabel.trim()) return;

    // 1. Buscamos el apartamento actual para obtener el inventario existente
    const apt = apartments.find(a => a.id === apartmentId);
    if (!apt) return;

    const itemKey = newInvLabel.toLowerCase().trim().replace(/\s+/g, '_');
    const newItem = {
      label: newInvLabel.trim(),
      icon: newInvIcon,
      current: parseInt(newInvCurrent) || 0,
      min: parseInt(newInvMin) || 0
    };

    // 2. Construimos el nuevo objeto de inventario completo
    const updatedInventory = {
      ...(apt.inventory || {}), // Asegura que no falle si es null
      [itemKey]: newItem
    };

    // 3. Persistimos en Supabase (Asegúrate de apuntar a la tabla 'apartamentos')
    const { error } = await supabase
      .from('apartamentos')
      .update({ inventory: updatedInventory })
      .eq('id', apartmentId);

    if (error) {
      console.error("Error al guardar en Supabase:", error);
      alert("No se pudo guardar el artículo. Revisa tu conexión.");
      return;
    }

    // 4. Actualizamos el estado local solo si Supabase respondió bien
    setApartments(prev => prev.map(a =>
      a.id === apartmentId ? { ...a, inventory: updatedInventory } : a
    ));

    // 5. Limpiamos formulario
    setNewInvLabel('');
    setNewInvIcon('');
    setNewInvMin('');
    setNewInvCurrent('');
  };

  const updateInventoryItem = async (apartmentId, key, changes) => {
  console.log("DEBUG: Iniciando actualización para:", apartmentId, "Clave:", key, "Cambios:", changes);
  
  const apt = apartments.find(a => a.id === apartmentId);
  if (!apt) {
    console.error("DEBUG: Apartamento no encontrado");
    return;
  }

  const updatedInventory = {
    ...apt.inventory,
    [key]: {
      ...apt.inventory[key],
      ...changes
    }
  };

  console.log("DEBUG: Objeto a enviar a Supabase:", updatedInventory);

  const { data, error } = await supabase
    .from('apartamentos')
    .update({ inventory: updatedInventory })
    .eq('id', apartmentId)
    .select(); // El .select() es vital para ver si la BD responde

  if (error) {
    console.error("DEBUG: ERROR CRÍTICO EN SUPABASE:", error);
    alert("Error: " + error.message);
    return;
  }

  console.log("DEBUG: Respuesta exitosa de Supabase:", data);
  
  // Aquí React debería actualizar la UI y disparar el Realtime
  setApartments(prev => prev.map(a => 
    a.id === apartmentId ? { ...a, inventory: updatedInventory } : a
  ));
};

const deleteInventoryItem = async (apartmentId, itemKey) => {
  const apt = apartments.find(a => a.id === apartmentId);
  if (!apt) return;

  // 1. Creamos un nuevo objeto eliminando la llave del ítem
  const updatedInventory = { ...apt.inventory };
  delete updatedInventory[itemKey];

  // 2. Persistimos el cambio en Supabase (¡Esto es lo que falta!)
  const { error } = await supabase
    .from('apartamentos')
    .update({ inventory: updatedInventory })
    .eq('id', apartmentId);

  if (error) {
    console.error("Error al eliminar de la base de datos:", error);
    alert("No se pudo eliminar el artículo.");
    return;
  }

  // 3. Actualizamos el estado local para la UI
  setApartments(prev => prev.map(a => 
    a.id === apartmentId ? { ...a, inventory: updatedInventory } : a
  ));
};

  const deleteApartment = async (apartmentId) => {
    // 1. ELIMINAR EN SUPABASE (La parte que faltaba)
    const { error } = await supabase
      .from('apartamentos')
      .delete()
      .eq('id', apartmentId);

    if (error) {
      console.error("Error al eliminar en la BD:", error);
      alert("No se pudo eliminar de la base de datos");
      return;
    }

    // 2. ELIMINAR EN ESTADO LOCAL (Para que la UI se refresque al instante)
    setApartments(apartments.filter(apt => apt.id !== apartmentId));

    // Si estabas editando este apartamento, cierra el editor
    if (editingApartmentId === apartmentId) {
      setEditingApartmentId(null);
    }
  };

  const getLowStockItems = (apt) => {
    return Object.entries(apt?.inventory || {})
      .filter(([key, item]) => {
        // Forzamos la conversión a número para evitar que "9" sea mayor que "10"
        const actual = Number(item.stock_actual ?? item.current ?? 0);
        const minimo = Number(item.stock_minimo ?? item.min ?? 0);
        return actual < minimo;
      })
      .map(([key, item]) => ({ key, ...item }));
  };

  const elapsedTime = startTime ? calculateDuration(startTime, new Date()) : '--';
  const completionPercentage = calculateCompletionPercentage();
  const lowStockAlerts = currentApartment ? getLowStockItems(currentApartment) : [];

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

            {/* Alertas de Stock Bajo */}
            {lowStockAlerts.length > 0 && (
              <div style={{ backgroundColor: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#92400e', margin: '0 0 0.5rem 0' }}>⚠️ Stock bajo detectado:</p>
                <ul style={{ fontSize: '13px', color: '#92400e', margin: 0, paddingLeft: '1.25rem' }}>
                  {lowStockAlerts.map(item => (
                    <li key={item.key} style={{ margin: '0.25rem 0' }}>
                      {item.icon} {item.label}: {item.current}/{item.min}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Inventario */}
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 500, margin: '0 0 1rem 0' }}>📊 Inventario</h2>
              {Object.entries(currentApartment.inventory).map(([key, item]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', backgroundColor: item.current < item.min ? '#fee2e2' : '#f5f5f5', borderRadius: '6px', gap: '1rem', marginBottom: '0.75rem', borderLeft: item.current < item.min ? '3px solid #ef4444' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                    <span style={{ fontSize: '18px' }}>{item.icon}</span>
                    <div>
                      <span style={{ fontSize: '13px', fontWeight: 500, display: 'block' }}>{item.label}</span>
                      <span style={{ fontSize: '11px', color: '#666666' }}>Mín: {item.min}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button onClick={() => updateInventory(key, -1)} style={{ width: '28px', height: '28px', border: '1px solid #d0d0d0', backgroundColor: '#ffffff', borderRadius: '6px', cursor: 'pointer', fontSize: '16px' }}>−</button>
                    <span style={{ fontSize: '15px', fontWeight: 600, minWidth: '24px', textAlign: 'center', color: item.current < item.min ? '#ef4444' : '#1a1a1a' }}>{item.current}</span>
                    <button onClick={() => updateInventory(key, 1)} style={{ width: '28px', height: '28px', border: '1px solid #d0d0d0', backgroundColor: '#ffffff', borderRadius: '6px', cursor: 'pointer', fontSize: '16px' }}>+</button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem' }}>
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500 }}>Progreso</span>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#10b981' }}>{completionPercentage}%</span>
                </div>
                <div style={{ width: '100%', height: '6px', backgroundColor: '#f0f0f0', borderRadius: '6px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${completionPercentage}%`, backgroundColor: '#10b981' }} />
                </div>
              </div>
              <button onClick={submitReport} style={{ width: '100%', padding: '0.75rem', backgroundColor: '#3b82f6', color: '#ffffff', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>✓ Finalizar y enviar reporte</button>
            </div>
          </div>
        )}

        {/* OWNER - REPORTES */}
        {userRole === 'owner' && currentTab === 'owner' && (
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '1.5rem' }}>📋 Reportes de Aseos</h2>

            {isLoadingReports ? (
              <p style={{ fontSize: '13px', color: '#666666', textAlign: 'center', padding: '2rem' }}>
                🔄 Cargando reportes en tiempo real desde Supabase...
              </p>
            ) : apartments.length === 0 ? (
              <div style={{ backgroundColor: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '8px', padding: '1rem', textAlign: 'center' }}>
                <p style={{ fontSize: '13px', color: '#92400e', margin: 0 }}>No hay apartamentos</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                {apartments.map(apt => {
                  const aptReports = dbReports.filter(r => r.apartamento === apt.name);
                  const lowStock = getLowStockItems(apt);

                  return (
                    <div key={apt.id} style={{ backgroundColor: '#ffffff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem' }}>
                      <h3 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 1rem 0', color: '#1a1a1a' }}>{apt.name}</h3>

                      {/* Alertas de stock bajo */}
                      {lowStock.length > 0 && (
                        <div style={{ backgroundColor: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '6px', padding: '0.75rem', marginBottom: '1rem' }}>
                          <p style={{ fontSize: '12px', fontWeight: 600, color: '#92400e', margin: 0 }}>⚠️ Stock bajo:</p>
                          <ul style={{ fontSize: '11px', color: '#92400e', margin: '0.25rem 0 0 0', paddingLeft: '1rem' }}>
                            {lowStock.map(item => (
                              <li key={item.key}>{item.icon} {item.label}: {item.current}/{item.min}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {aptReports.length === 0 ? (
                        <p style={{ fontSize: '13px', color: '#999999', textAlign: 'center', padding: '1rem 0', margin: 0 }}>Sin reportes en base de datos</p>
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
                              <p style={{ margin: '0.25rem 0', fontSize: '11px' }}>
                                📝 {report.novedades || 'Sin novedades'}
                              </p>
                              <div style={{ fontSize: '10px', color: '#666666', marginTop: '0.5rem', borderTop: '1px dashed #e0e0e0', paddingTop: '0.25rem', display: 'flex', justifyContent: 'space-between' }}>
                                <span>🕒 {new Date(report.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
                                <span>{report.estado === 'En Progreso' ? '🔄' : '✅'}</span>
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
            {editingApartmentId ? (() => {
              const aptToEdit = apartments.find(a => a.id === editingApartmentId);
              if (!aptToEdit) return null;

              return (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                    <button onClick={() => setEditingApartmentId(null)} style={{ padding: '0.5rem 1rem', backgroundColor: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
                      ⬅ Volver
                    </button>
                    <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Configurar: <span style={{ color: '#2563eb' }}>{aptToEdit.name}</span></h2>
                  </div>

                  {/* EDITAR NOMBRE */}
                  <div style={{ backgroundColor: '#ffffff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 0.75rem 0' }}>📛 Nombre del Apartamento</h3>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <input type="text" value={editingNameValue} onChange={(e) => setEditingNameValue(e.target.value)} style={{ flex: 1, padding: '0.6rem', border: '1px solid #d0d0d0', borderRadius: '6px', fontSize: '13px' }} />
                      <button onClick={() => { updateApartmentName(aptToEdit.id, editingNameValue); alert('Nombre actualizado'); }} style={{ padding: '0.6rem 1.25rem', backgroundColor: '#10b981', color: '#ffffff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Guardar</button>
                    </div>
                  </div>

                  {/* EDITAR CHECKLIST */}
                  <div style={{ backgroundColor: '#ffffff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 0.5rem 0' }}>🧹 Checklist por Zonas</h3>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
                      {Object.entries(zones).map(([key, zone]) => (
                        <button key={key} onClick={() => setSelectedZoneForEdit(key)} style={{ padding: '0.4rem 0.8rem', backgroundColor: selectedZoneForEdit === key ? '#eff6ff' : 'transparent', border: `1px solid ${selectedZoneForEdit === key ? '#3b82f6' : '#e5e7eb'}`, borderRadius: '20px', color: selectedZoneForEdit === key ? '#2563eb' : '#4b5563', fontSize: '12px', fontWeight: selectedZoneForEdit === key ? 600 : 400, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          {zone.icon} {zone.name}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                      <input type="text" value={newChecklistItem} onChange={(e) => setNewChecklistItem(e.target.value)} placeholder={`Nueva tarea para ${zones[selectedZoneForEdit].name}...`} style={{ flex: 1, padding: '0.6rem', border: '1px solid #d0d0d0', borderRadius: '6px', fontSize: '13px' }} />
                      <button onClick={() => addChecklistItem(aptToEdit.id, selectedZoneForEdit)} style={{ padding: '0.6rem 1.25rem', backgroundColor: '#3b82f6', color: '#ffffff', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>＋ Añadir</button>
                    </div>
                    <div style={{ backgroundColor: '#f9fafb', padding: '0.75rem', borderRadius: '6px' }}>
                      {Object.keys(aptToEdit.checklist[selectedZoneForEdit] || {}).length === 0 ? (
                        <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>Sin tareas en esta zona.</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          {Object.keys(aptToEdit.checklist[selectedZoneForEdit]).map(item => (
                            <div key={item} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff', padding: '0.5rem 0.75rem', borderRadius: '4px', border: '1px solid #e5e7eb' }}>
                              <span style={{ fontSize: '13px' }}>{item}</span>
                              <button onClick={() => deleteChecklistItem(aptToEdit.id, selectedZoneForEdit, item)} style={{ border: 'none', backgroundColor: 'transparent', color: '#ef4444', cursor: 'pointer' }}>🗑️</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* EDITAR INVENTARIO */}
                  <div style={{ backgroundColor: '#ffffff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 0.5rem 0' }}>📊 Inventario</h3>

                    {/* Agregar nuevo artículo */}
                    <div style={{ backgroundColor: '#f9fafb', padding: '1rem', borderRadius: '6px', marginBottom: '1rem', border: '1px solid #e5e7eb' }}>
                      <h4 style={{ fontSize: '13px', fontWeight: 600, margin: '0 0 1rem 0' }}>➕ Nuevo Artículo</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <div>
                          <label style={{ fontSize: '11px', fontWeight: 500, display: 'block', marginBottom: '0.25rem' }}>Nombre</label>
                          <input type="text" value={newInvLabel} onChange={(e) => setNewInvLabel(e.target.value)} placeholder="Toallas" style={{ width: '100%', padding: '0.5rem', border: '1px solid #d0d0d0', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '11px', fontWeight: 500, display: 'block', marginBottom: '0.25rem' }}>Emoji</label>
                          <input type="text" value={newInvIcon} onChange={(e) => setNewInvIcon(e.target.value)} style={{ width: '100%', padding: '0.5rem', border: '1px solid #d0d0d0', borderRadius: '4px', fontSize: '16px', boxSizing: 'border-box', textAlign: 'center' }} />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <div>
                          <label style={{ fontSize: '11px', fontWeight: 500, display: 'block', marginBottom: '0.25rem' }}>Stock Mínimo</label>
                          <input type="number" value={newInvMin} onChange={(e) => setNewInvMin(e.target.value)} min="0" style={{ width: '100%', padding: '0.5rem', border: '1px solid #d0d0d0', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '11px', fontWeight: 500, display: 'block', marginBottom: '0.25rem' }}>Stock Actual</label>
                          <input type="number" value={newInvCurrent} onChange={(e) => setNewInvCurrent(e.target.value)} min="0" style={{ width: '100%', padding: '0.5rem', border: '1px solid #d0d0d0', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }} />
                        </div>
                      </div>
                      <button onClick={() => addInventoryItem(aptToEdit.id)} style={{ width: '100%', padding: '0.6rem', backgroundColor: '#3b82f6', color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Agregar Artículo</button>
                    </div>

                    {/* Listar artículos existentes */}
                    <h4 style={{ fontSize: '13px', fontWeight: 600, margin: '0 0 0.75rem 0' }}>Artículos Actuales</h4>
                    {Object.entries(aptToEdit.inventory).length === 0 ? (
                      <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0, textAlign: 'center', padding: '1rem' }}>Sin artículos. Agrega uno arriba.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {Object.entries(aptToEdit.inventory).map(([key, item]) => (
                          <div key={key} style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.75rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                              <div>
                                <p style={{ fontSize: '13px', fontWeight: 600, margin: 0 }}>{item.icon} {item.label}</p>
                              </div>
                              <button onClick={() => deleteInventoryItem(aptToEdit.id, key)} style={{ border: 'none', backgroundColor: '#fee2e2', color: '#991b1b', padding: '0.25rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>🗑️ Eliminar</button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                              <div>
                                <label style={{ fontSize: '11px', fontWeight: 500, display: 'block', marginBottom: '0.25rem', color: '#666666' }}>Stock Mínimo</label>
                                <input
                                  type="number"
                                  defaultValue={item.min}
                                  onBlur={(e) => updateInventoryItem(aptToEdit.id, key, { min: parseInt(e.target.value) || 0 })}
                                  min="0"
                                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d0d0d0', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }}
                                />
                              </div>
                              <div>
                                <label style={{ fontSize: '11px', fontWeight: 500, display: 'block', marginBottom: '0.25rem', color: '#666666' }}>Stock Actual</label>
                                <input
                                  type="number"
                                  defaultValue={item.current}
                                  onBlur={(e) => updateInventoryItem(aptToEdit.id, key, { current: parseInt(e.target.value) || 0 })}
                                  min="0"
                                  style={{
                                    width: '100%',
                                    padding: '0.5rem',
                                    border: item.current < item.min ? '2px solid #ef4444' : '1px solid #d0d0d0',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    boxSizing: 'border-box',
                                    backgroundColor: item.current < item.min ? '#fee2e2' : '#ffffff'
                                  }}
                                />
                                {item.current < item.min && (
                                  <p style={{ fontSize: '10px', color: '#ef4444', margin: '0.25rem 0 0 0', fontWeight: 600 }}>⚠️ Stock bajo</p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })() : (
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
                  {apartments.map(apt => {
                    const lowStock = getLowStockItems(apt);
                    return (
                      <div key={apt.id} style={{ backgroundColor: '#ffffff', border: lowStock.length > 0 ? '2px solid #fcd34d' : '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem' }}>
                        <h4 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 0.5rem 0', color: '#1a1a1a' }}>{apt.name}</h4>
                        <p style={{ fontSize: '12px', color: '#666666', margin: '0 0 0.75rem 0' }}>Zonas: {Object.keys(apt.checklist).length} | Artículos: {Object.keys(apt.inventory).length}</p>
                        {lowStock.length > 0 && (
                          <div style={{ fontSize: '11px', color: '#f59e0b', marginBottom: '0.75rem', padding: '0.5rem', backgroundColor: '#fffbeb', borderRadius: '4px' }}>
                            ⚠️ {lowStock.length} artículo(s) con stock bajo
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button onClick={() => { setEditingApartmentId(apt.id); setEditingNameValue(apt.name); }} style={{ flex: 1, padding: '0.5rem', backgroundColor: '#f0f4ff', color: '#3b82f6', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>✏️ Editar</button>
                          <button onClick={() => { if (window.confirm(`¿Eliminar ${apt.name}?`)) deleteApartment(apt.id); }} style={{ padding: '0.5rem', backgroundColor: '#fecaca', color: '#991b1b', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>🗑️</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ============ MÓDULO: REVENUE ANALYSIS ============
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
      reports: []
    }
  ]);

  const credentials = {
    employee: { username: 'aseo', password: '1234' },
    owner: { username: 'propietario', password: '1234' }
  };

  useEffect(() => {
    document.title = 'Clean Check RPM - Revenue Property Management';
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
      <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', backgroundColor: '#f8f8f8', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
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
              <button onClick={() => handleLogin('employee')} style={{ padding: '0.75rem', backgroundColor: '#3b82f6', color: '#ffffff', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>🧹 Personal de Limpieza</button>
              <button onClick={() => handleLogin('owner')} style={{ padding: '0.75rem', backgroundColor: '#10b981', color: '#ffffff', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>👤 Propietario</button>
            </div>
          </div>
          <div style={{ backgroundColor: '#f0f4ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '1rem', fontSize: '12px', color: '#1e40af' }}>
            <strong>Credenciales de demo:</strong>
            <div style={{ marginTop: '0.5rem', lineHeight: 1.6 }}>
              <div>🧹 Personal de Limpieza: <code style={{ backgroundColor: '#ffffff', padding: '0.25rem 0.5rem', borderRadius: '3px', fontFamily: 'monospace' }}>aseo / 1234</code></div>
              <div>👤 Propietario: <code style={{ backgroundColor: '#ffffff', padding: '0.25rem 0.5rem', borderRadius: '3px', fontFamily: 'monospace' }}>propietario / 1234</code></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', backgroundColor: '#f8f8f8', minHeight: '100vh', padding: '0' }}>
      <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e0e0e0', padding: '1rem', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: userRole === 'owner' ? '1rem' : '0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '24px' }}>✓</span>
            <div>
              <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0', color: '#1a1a1a' }}>Cleaning Check</h1>
              <p style={{ fontSize: '12px', color: '#666666', margin: '0.25rem 0 0 0' }}>{userRole === 'employee' ? '🧹 Personal de Limpieza' : '👤 Propietario'}</p>
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