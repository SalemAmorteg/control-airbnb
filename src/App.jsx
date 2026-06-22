import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

// ============ MÓDULO: CLEANING CHECK ============
const CleaningCheckModule = ({ apartments, setApartments, onLogout }) => {
  const [isLoggedIn, setIsLoggedIn] = useState(() => localStorage.getItem('isLoggedIn') === 'true');
  const [userRole, setUserRole] = useState(() => localStorage.getItem('userRole'));
  // Cambiado: Ahora decide la pestaña inicial dependiendo de si hay un servicio en curso
  const [currentTab, setCurrentTab] = useState(() => {
    const isServiceActive = localStorage.getItem('serviceStarted') === 'true';
    if (localStorage.getItem('userRole') === 'owner') return 'owner';
    return isServiceActive ? 'cleaning' : 'home';
  });
  // Cambiado: Leen directamente del LocalStorage desde el primer milisegundo
  const [currentApartmentId, setCurrentApartmentId] = useState(() => {
    const saved = localStorage.getItem('currentApartmentId');
    return saved ? Number(saved) : null;
  });
  const [workerName, setWorkerName] = useState(() => localStorage.getItem('workerName') || '');
  const [serviceStarted, setServiceStarted] = useState(() => localStorage.getItem('serviceStarted') === 'true');
  const [startTime, setStartTime] = useState(() => {
    const saved = localStorage.getItem('startTime');
    return saved ? new Date(saved) : null;
  });
  const [activeReportId, setActiveReportId] = useState(() => localStorage.getItem('activeReportId') || null);
  const [notasAseo, setNotasAseo] = useState('');

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

  useEffect(() => {
    const savedReportId = localStorage.getItem('activeReportId');
    const isServiceStarted = localStorage.getItem('serviceStarted') === 'true';

    if (isServiceStarted && savedReportId) {
      setActiveReportId(savedReportId);
      setServiceStarted(true);
      setCurrentTab('cleaning'); // Obliga a volver a la pestaña de aseo
    }
  }, []);

  // ===== SINCRONIZACIÓN DE INVENTARIO =====

  useEffect(() => {
    const fetchApartmentsFromDB = async () => {
      // 1. Descargamos los apartamentos base
      const { data: aptsData, error } = await supabase.from('apartamentos').select('*');
      if (aptsData) {
        let updatedApts = aptsData;

        // 2. Si es empleado, escaneamos la BD buscando algún servicio activo "En Progreso"
        if (userRole === 'employee') {
          const { data: activeReports } = await supabase
            .from('reportes_aseo')
            .select('*')
            .eq('estado', 'En Progreso')
            .order('created_at', { ascending: false })
            .limit(1);

          if (activeReports && activeReports.length > 0) {
            const activeReport = activeReports[0];
            // Buscamos el apartamento que coincida con el nombre del reporte
            const matchingApt = aptsData.find(a => a.name === activeReport.apartamento);

            if (matchingApt) {
              // Inyectamos el checklist guardado en Supabase dentro de nuestro estado local
              updatedApts = aptsData.map(apt => {
                if (apt.id === matchingApt.id) {
                  return {
                    ...apt,
                    checklist: activeReport.checklist_zonas || apt.checklist
                  };
                }
                return apt;
              });

              // Extraemos el nombre del trabajador desde la cadena de novedades
              let extractedWorkerName = '';
              if (activeReport.novedades && activeReport.novedades.includes('Servicio iniciado por: ')) {
                extractedWorkerName = activeReport.novedades.replace('Servicio iniciado por: ', '');
              }

              // Sincronizamos todos los estados y forzamos la vista de Aseo
              setActiveReportId(activeReport.id);
              setCurrentApartmentId(matchingApt.id);
              setWorkerName(extractedWorkerName || localStorage.getItem('workerName') || '');
              setStartTime(new Date(activeReport.created_at));
              setServiceStarted(true);
              setCurrentTab('cleaning');

              // Aseguramos persistencia local de respaldo
              localStorage.setItem('activeReportId', activeReport.id);
              localStorage.setItem('serviceStarted', 'true');
              localStorage.setItem('currentApartmentId', matchingApt.id.toString());
              if (extractedWorkerName) localStorage.setItem('workerName', extractedWorkerName);
            }
          }
        } else {
          // Si es administrador o rehidratación rápida por localStorage tradicional
          const savedReportId = localStorage.getItem('activeReportId');
          const isServiceActive = localStorage.getItem('serviceStarted') === 'true';
          const savedAptId = localStorage.getItem('currentApartmentId');

          if (isServiceActive && savedReportId && savedAptId) {
            const { data: reportData } = await supabase
              .from('reportes_aseo')
              .select('checklist_zonas')
              .eq('id', savedReportId)
              .single();

            if (reportData) {
              updatedApts = aptsData.map(apt => {
                if (apt.id === Number(savedAptId)) {
                  return { ...apt, checklist: reportData.checklist_zonas || apt.checklist };
                }
                return apt;
              });
            }
          }
        }

        setApartments(updatedApts);
      }
    };

    fetchApartmentsFromDB();

    // Suscripción Realtime
    const channel = supabase
      .channel('public:apartamentos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'apartamentos' }, () => {
        fetchApartmentsFromDB();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [setApartments, userRole]);

  useEffect(() => {
    localStorage.setItem('isLoggedIn', isLoggedIn);
    localStorage.setItem('userRole', userRole || '');
  }, [isLoggedIn, userRole]);


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
      // 1. Limpiamos los datos: Aseguramos que son solo valores de texto/números/booleanos
      const cleanChecklist = JSON.parse(JSON.stringify(currentApartment.checklist));
      const cleanInventory = JSON.parse(JSON.stringify(currentApartment.inventory));

      const { data, error } = await supabase
        .from('reportes_aseo')
        .insert([{
          apartamento: currentApartment.name,
          estado: 'En Progreso',
          checklist_zonas: cleanChecklist, // Usamos la versión limpia
          inventario: cleanInventory,      // Usamos la versión limpia
          completion: 0,
          novedades: `Servicio iniciado por: ${workerName}`
        }])
        .select();

      if (error) throw error;

      const now = new Date();
      if (data && data.length > 0) {
        const newReportId = data[0].id;
        setActiveReportId(newReportId);
        // Persistencia completa al iniciar
        localStorage.setItem('activeReportId', newReportId);
        localStorage.setItem('serviceStarted', 'true');
        localStorage.setItem('currentApartmentId', currentApartmentId.toString());
        localStorage.setItem('workerName', workerName);
        localStorage.setItem('startTime', new Date().toISOString());
      }

      setStartTime(now);
      setServiceStarted(true);
      setCurrentTab('cleaning');
    } catch (error) {
      console.error(error); // Ver el error completo en consola
      alert('Error al conectar con Supabase: ' + error.message);
    }
  };

  const submitReport = async () => {
    if (!currentApartment || !activeReportId) return;

    const now = new Date();
    const completion = calculateCompletionPercentage();
    const duration = calculateDuration(startTime, now);
    const notes = completion === 100 ? 'Limpieza completada al 100%' : 'Limpieza parcial';

    // 1. Revisar qué ítems quedaron por debajo del mínimo
    const lowStockItems = Object.values(currentApartment.inventory || {}).filter(item => {
      // Usamos Number() para evitar el error matemático de texto vs texto
      const actual = Number(item.stock_actual ?? item.current ?? 0);
      const minimo = Number(item.stock_minimo ?? item.min ?? 0);
      return actual < minimo;
    });

    // 2. Construir el texto de advertencia si hay faltantes
    const alertasStock = lowStockItems.length > 0
      ? ` | ⚠️ FALTAN INSUMOS: ${lowStockItems.map(i => i.label).join(', ')}`
      : '';

    // 3. NUEVO: Preparar el texto de las notas del empleado (si escribió algo)
    const notasDelEmpleado = notasAseo.trim() !== ''
      ? ` | 📝 Notas del empleado: ${notasAseo.trim()}`
      : '';

    try {
      const { error } = await supabase
        .from('reportes_aseo')
        .update({
          estado: 'Completado',
          checklist_zonas: currentApartment.checklist,
          inventario: currentApartment.inventory,
          completion: completion,
          // 4. MODIFICADO: Añadimos notasDelEmpleado al final de la cadena
          novedades: `Trabajador: ${workerName} | Duración: ${duration} | Nota: ${notes}${alertasStock}${notasDelEmpleado}`
        })
        .eq('id', activeReportId);

      if (error) throw error;

      setApartments(prev => prev.map(apt => {
        if (apt.id === currentApartmentId) {
          return { ...apt, checklist: resetChecklist(apt.checklist) };
        }
        return apt;
      }));

      // Limpiamos los estados de la sesión de aseo
      setServiceStarted(false);
      setStartTime(null);
      setWorkerName('');
      setCurrentApartmentId(null);
      setActiveReportId(null);
      setNotasAseo('');
      setCurrentTab('home');

      // Limpieza total del localStorage
      localStorage.removeItem('activeReportId');
      localStorage.removeItem('serviceStarted');
      localStorage.removeItem('currentApartmentId');
      localStorage.removeItem('workerName');
      localStorage.removeItem('startTime');

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
    // 1. Aviso de confirmación
    const confirmar = window.confirm(
      "⚠️ ADVERTENCIA: ¿Estás seguro de que deseas eliminar este apartamento?\n\n" +
      "También se eliminarán TODOS los reportes de aseo asociados a él. Esta acción NO se puede deshacer."
    );

    if (!confirmar) return;

    try {
      // 2. Buscamos el apartamento localmente para saber su NOMBRE
      const apt = apartments.find(a => a.id === apartmentId);
      if (!apt) return;

      // 3. Borramos los reportes usando la columna 'apartamento' (que tiene el nombre en texto)
      const { error: errorReportes } = await supabase
        .from('reportes_aseo')
        .delete()
        .eq('apartamento', apt.name); // ¡Aquí estaba el secreto!

      if (errorReportes) {
        console.error("Error al eliminar los reportes de aseo:", errorReportes);
        alert("Hubo un problema al intentar borrar los reportes asociados.");
        return;
      }

      // 4. Si los reportes se borraron bien, borramos el apartamento
      const { error: errorApto } = await supabase
        .from('apartamentos')
        .delete()
        .eq('id', apartmentId);

      if (errorApto) {
        console.error("Error al eliminar el apartamento:", errorApto);
        alert("No se pudo eliminar el apartamento.");
        return;
      }

      // 5. Actualizamos la pantalla
      setApartments(prev => prev.filter(a => a.id !== apartmentId));

    } catch (err) {
      console.error("Error inesperado:", err);
    }
  };

  // --- FUNCIÓN PARA BOTONES + Y - EN PERFIL ASEO ---
  const handleAseoStockChange = async (apartmentId, itemKey, changeAmount) => {
    const apt = apartments.find(a => a.id === apartmentId);
    if (!apt || !apt.inventory[itemKey]) return;

    // Calculamos el nuevo valor
    const currentStock = apt.inventory[itemKey].current;
    let newStock = currentStock + changeAmount;

    // Evitamos números negativos
    if (newStock < 0) newStock = 0;

    // 1. Preparamos el objeto
    const updatedInventory = {
      ...apt.inventory,
      [itemKey]: {
        ...apt.inventory[itemKey],
        current: newStock
      }
    };

    // 2. Guardamos en Supabase
    const { error } = await supabase
      .from('apartamentos')
      .update({ inventory: updatedInventory })
      .eq('id', apartmentId);

    if (error) {
      console.error("Error al actualizar stock desde Aseo:", error);
      return;
    }

    // 3. Actualizamos la pantalla
    setApartments(prev => prev.map(a =>
      a.id === apartmentId ? { ...a, inventory: updatedInventory } : a
    ));
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
      <div role="main">
        {/* contenido existente */}
      </div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '2rem', borderBottom: '1px solid #E5E5E5', paddingBottom: '0.75rem', marginBottom: '2rem', overflow: 'auto' }}>
        {userRole === 'employee' && (
          <>
            <button
              onClick={() => {
                if (serviceStarted) {
                  alert("No puedes salir. Finaliza el reporte primero.");
                  return;
                }
                setCurrentTab('home');
              }} style={{ padding: '0.6rem 0', backgroundColor: 'transparent', border: 'none', borderBottom: currentTab === 'home' ? '3px solid #8B6F2C' : '3px solid transparent', color: currentTab === 'home' ? '#1A1A1A' : '#525252', fontSize: '12px', fontWeight: currentTab === 'home' ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.5px', transition: 'all 0.3s' }}>Inicio</button>
            <button
              onClick={() => {
                if (!serviceStarted) {
                  alert("Debes seleccionar un apartamento e iniciar el servicio primero.");
                  return;
                }
                setCurrentTab('cleaning');
              }}
              style={{ padding: '0.6rem 0', backgroundColor: 'transparent', border: 'none', borderBottom: currentTab === 'cleaning' ? '3px solid #8B6F2C' : '3px solid transparent', color: currentTab === 'cleaning' ? '#1A1A1A' : '#525252', fontSize: '12px', fontWeight: currentTab === 'cleaning' ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.5px', transition: 'all 0.3s' }}
            >
              Aseo
            </button>
          </>
        )}
        {userRole === 'owner' && (
          <>
            <button onClick={() => setCurrentTab('owner')} style={{ padding: '0.5rem 1rem', backgroundColor: currentTab === 'owner' ? '#F9F9F9' : 'transparent', border: 'none', borderBottom: currentTab === 'owner' ? '2px solid #3b82f6' : 'none', color: '#1A1A1A', fontSize: '13px', fontWeight: currentTab === 'owner' ? 500 : 400, cursor: 'pointer', whiteSpace: 'nowrap' }}>Reportes</button>
            <button onClick={() => setCurrentTab('config')} style={{ padding: '0.5rem 1rem', backgroundColor: currentTab === 'config' ? '#F9F9F9' : 'transparent', border: 'none', borderBottom: currentTab === 'config' ? '2px solid #3b82f6' : 'none', color: '#1A1A1A', fontSize: '13px', fontWeight: currentTab === 'config' ? 500 : 400, cursor: 'pointer', whiteSpace: 'nowrap' }}>Configuración</button>
          </>
        )}
      </div>

      {/* CONTENIDO */}
      <div style={{ maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>

        {/* EMPLOYEE - HOME */}
        {userRole === 'employee' && currentTab === 'home' && !serviceStarted && (
          <div>
            <h2 style={{ color: '#999999', fontSize: '16px', fontWeight: 600, marginBottom: '1rem' }}>Selecciona un apartamento para inciar el servicio</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
              {apartments.map(apt => (
                <div key={apt.id} onClick={() => setCurrentApartmentId(apt.id)} style={{
                  backgroundColor: '#948c399c',
                  border: '1px solid #00000086',
                  borderRadius: '25px',
                  padding: '1.5rem',
                  marginBottom: '1rem',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                  cursor: 'pointer'
                }}>
                  <h3 style={{ color: '#000000b0', fontSize: '15px', fontWeight: 700, margin: '0 0 0.5rem 0' }}>{apt.name}</h3>
                </div>
              ))}
            </div>

            {currentApartmentId && (
              <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1.5rem' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 1rem 0' }}>👤 Datos del trabajador</h3>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '0.6rem', color: '#1A1A1A', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Nombre Completo</label>
                  <input type="text" value={workerName} onChange={(e) => setWorkerName(e.target.value)} placeholder="Ej: María García" style={{ width: '100%', padding: '0.8rem', border: '2px solid #999999', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', fontFamily: 'inherit', color: '#999999', backgroundColor: '#FFFFFF' }} />
                </div>
                <button onClick={startService} disabled={!currentApartmentId || !workerName} style={{ width: '100%', padding: '0.85rem', backgroundColor: (currentApartmentId && workerName) ? '#8B6F2C' : '#D0D0D0', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: (currentApartmentId && workerName) ? 'pointer' : 'not-allowed', textTransform: 'uppercase', letterSpacing: '0.5px', transition: 'all 0.3s' }}>▶ Iniciar servicio</button>
              </div>
            )}
          </div>
        )}

        {/* EMPLOYEE - CLEANING */}
        {userRole === 'employee' && currentTab === 'cleaning' && serviceStarted && currentApartment && (
          <div>
            <h2 style={{ color: '#999999', fontSize: '15px', fontWeight: 600, marginBottom: '1rem' }}>📋 Lista de tareas</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
              {Object.entries(zones).map(([zoneKey, zone]) => (
                <div key={zoneKey} style={{ backgroundColor: '#FFFFFF', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem' }}>
                  <p style={{ fontSize: '14px', fontWeight: 500, margin: '0 0 0.75rem 0' }}>{zone.icon} {zone.name}</p>
                  {Object.entries(currentApartment.checklist[zoneKey] || {}).map(([item, completed]) => (
                    <label key={item} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '13px', marginBottom: '0.5rem' }}>
                      <input type="checkbox" checked={completed} onChange={() => toggleChecklistItem(zoneKey, item)} style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#8B6F2C' }} />
                      <span style={{ textDecoration: completed ? 'line-through' : 'none', color: completed ? '#525252' : '#1A1A1A' }}>{item}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>

            {/* Alertas de Stock Bajo */}
            {lowStockAlerts.length > 0 && (
              <div style={{ backgroundColor: '#F9F5F0', border: '2px solid #8B6F2C', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
                <p style={{ fontSize: '12px', fontWeight: 700, color: '#5C5A2E', margin: '0 0 0.5rem 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>⚠️ Stock bajo detectado:</p>
                <ul style={{ fontSize: '13px', color: '#92400e', margin: 0, paddingLeft: '1.25rem' }}>
                  {lowStockAlerts.map(item => (
                    <li key={item.key} style={{ margin: '0.25rem 0' }}>
                      {item.icon} {item.label}: {item.current}/{item.min}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <>
              {/* INVENTARIO */}
              <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem' }}>
                <h2 style={{ color: '#999999', fontSize: '15px', fontWeight: 500, margin: '0 0 1rem 0' }}>Inventario</h2>

                {/* Verificación de seguridad: solo renderiza si inventory existe */}
                {currentApartment?.inventory && Object.entries(currentApartment.inventory).map(([key, item]) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', backgroundColor: item.current < item.min ? '#fee2e2' : '#F9F9F9', borderRadius: '6px', gap: '1rem', marginBottom: '0.75rem', borderLeft: item.current < item.min ? '3px solid #ef4444' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                      <span style={{ fontSize: '18px' }}>{item.icon}</span>
                      <div>
                        <span style={{ fontSize: '13px', fontWeight: 500, display: 'block' }}>{item.label}</span>
                        <span style={{ fontSize: '11px', color: '#626262' }}>Mín: {item.min}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <button
                        onClick={() => handleAseoStockChange(currentApartment.id, key, -1)}
                        disabled={item.current <= 0}
                        style={{ width: '28px', height: '28px', border: '1px solid #d0d0d0', backgroundColor: item.current <= 0 ? '#f3f4f6' : '#FFFFFF', borderRadius: '6px', cursor: item.current <= 0 ? 'not-allowed' : 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        −
                      </button>
                      <span style={{ fontSize: '15px', fontWeight: 600, minWidth: '24px', textAlign: 'center', color: item.current < item.min ? '#ef4444' : '#1A1A1A' }}>
                        {item.current}
                      </span>
                      <button
                        onClick={() => handleAseoStockChange(currentApartment.id, key, 1)}
                        style={{ width: '28px', height: '28px', border: '1px solid #d0d0d0', backgroundColor: '#FFFFFF', borderRadius: '6px', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* NOTAS / NOVEDADES */}
              <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem' }}>
                <h2 style={{ color: '#999999', fontSize: '15px', fontWeight: 500, margin: '0 0 0.5rem 0' }}>📝 Notas / Novedades</h2>
                <textarea
                  value={notasAseo}
                  onChange={(e) => setNotasAseo(e.target.value)}
                  placeholder="Deja un comentario para el propietario (ej. Se rompió un vaso, falta jabón...)"
                  style={{ width: '100%', padding: '0.75rem', border: '1px solid #d0d0d0', borderRadius: '6px', fontSize: '13px', minHeight: '80px', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', color: '#999999', backgroundColor: '#FFFFFF' }}
                />
              </div>

              {/* PROGRESO Y FINALIZAR */}
              <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem' }}>
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>Progreso</span>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: completionPercentage === 100 ? '#458015' : '#9C7C38' }}>
                      {completionPercentage}%
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '6px', backgroundColor: '#f0f0f0', borderRadius: '6px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${completionPercentage}%`, backgroundColor: completionPercentage === 100 ? '#458015' : '#9C7C38', transition: 'width 0.3s ease' }} />
                  </div>
                </div>

                <button
                  onClick={submitReport}
                  disabled={completionPercentage < 100}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    backgroundColor: completionPercentage === 100 ? '#458015' : '#9ca3af',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: completionPercentage === 100 ? 'pointer' : 'not-allowed',
                    transition: 'background-color 0.3s ease'
                  }}
                >
                  {completionPercentage === 100 ? '✓ Finalizar y enviar reporte' : 'Completa las tareas para enviar'}
                </button>
              </div>
            </>
          </div>
        )}

        {/* OWNER - REPORTES */}
        {userRole === 'owner' && currentTab === 'owner' && (
          <div>
            <h2 style={{ color: '#999999', fontSize: '16px', fontWeight: 600, marginBottom: '1.5rem' }}>Reportes de Aseos</h2>

            {isLoadingReports ? (
              <p style={{ fontSize: '13px', color: '#626262', textAlign: 'center', padding: '2rem' }}>
                🔄 Cargando reportes en tiempo real desde Supabase...
              </p>
            ) : apartments.length === 0 ? (
              <div style={{ backgroundColor: '#F9F5F0', border: '2px solid #8B6F2C', borderRadius: '8px', padding: '1rem', textAlign: 'center', marginBottom: '1rem' }}>
                <p style={{ fontSize: '12px', color: '#5C5A2E', margin: '0 0 0.5rem 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>No hay apartamentos</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                {apartments.map(apt => {
                  const aptReports = dbReports.filter(r => r.apartamento === apt.name);
                  const lowStock = getLowStockItems(apt);

                  return (
                    <div key={apt.id} style={{ backgroundColor: '#FFFFFF', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem' }}>
                      <h3 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 1rem 0', color: '#1A1A1A' }}>{apt.name}</h3>

                      {/* Alertas de stock bajo */}
                      {lowStock.length > 0 && (
                        <div style={{ backgroundColor: '#F9F5F0', border: '2px solid #8B6F2C', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
                          <p style={{ fontSize: '12px', fontWeight: 700, color: '#5C5A2E', margin: '0 0 0.5rem 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>⚠️ Stock bajo:</p>
                          <ul style={{ fontSize: '11px', color: '#92400e', margin: '0.25rem 0 0 0', paddingLeft: '1rem' }}>
                            {lowStock.map(item => (
                              <li key={item.key}>{item.icon} {item.label}: {item.current}/{item.min}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {aptReports.length === 0 ? (
                        <p style={{ fontSize: '13px', color: '#525252', textAlign: 'center', padding: '1rem 0', margin: 0 }}>Sin reportes en base de datos</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          {aptReports.slice(0, 5).map((report, idx) => (
                            <div
                              key={report.id || idx}
                              style={{
                                padding: '0.75rem',
                                backgroundColor: '#F9F9F9',
                                borderRadius: '6px',
                                borderLeft: `3px solid ${report.estado === 'En Progreso' ? '#9C7C38' : (report.completion === 100 ? '#1A1A1A' : '#f59e0b')}`,
                                fontSize: '12px'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                <strong>{new Date(report.created_at).toLocaleDateString('es-CO')}</strong>
                                <span style={{ color: report.estado === 'En Progreso' ? '#9C7C38' : (report.completion === 100 ? '#1A1A1A' : '#f59e0b'), fontWeight: 600 }}>
                                  {report.completion}%
                                </span>
                              </div>
                              <p style={{ margin: '0.25rem 0', fontSize: '11px' }}>
                                📝 {report.novedades || 'Sin novedades'}
                              </p>
                              <div style={{ fontSize: '10px', color: '#626262', marginTop: '0.5rem', borderTop: '1px dashed #e0e0e0', paddingTop: '0.25rem', display: 'flex', justifyContent: 'space-between' }}>
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
                    <button onClick={() => setEditingApartmentId(null)} style={{ padding: '0.6rem 1.25rem', backgroundColor: '#9C7C38', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>
                      ⬅ Volver
                    </button>
                    <h2 style={{ color: '#999999', fontSize: '16px', fontWeight: 600, margin: 0 }}>Configurar: <span style={{ color: '#000000' }}>{aptToEdit.name}</span></h2>
                  </div>

                  {/* EDITAR NOMBRE */}
                  <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 0.75rem 0' }}>Nombre del Apartamento</h3>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <input type="text" value={editingNameValue} onChange={(e) => setEditingNameValue(e.target.value)} style={{ color: '#999999', backgroundColor: '#FFFFFF', flex: 1, padding: '0.6rem', border: '1px solid #d0d0d0', borderRadius: '6px', fontSize: '13px' }} />
                      <button onClick={() => { updateApartmentName(aptToEdit.id, editingNameValue); alert('Nombre actualizado'); }} style={{ padding: '0.6rem 1.25rem', backgroundColor: '#1A1A1A', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Guardar</button>
                    </div>
                  </div>

                  {/* EDITAR CHECKLIST */}
                  <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 0.5rem 0' }}>Checklist por Zonas</h3>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
                      {Object.entries(zones).map(([key, zone]) => (
                        <button key={key} onClick={() => setSelectedZoneForEdit(key)} style={{ padding: '0.4rem 0.8rem', backgroundColor: selectedZoneForEdit === key ? '#eff6ff' : 'transparent', border: `1px solid ${selectedZoneForEdit === key ? '#9C7C38' : '#e5e7eb'}`, borderRadius: '20px', color: selectedZoneForEdit === key ? '#2563eb' : '#4b5563', fontSize: '12px', fontWeight: selectedZoneForEdit === key ? 600 : 400, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          {zone.icon} {zone.name}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                      <input type="text" value={newChecklistItem} onChange={(e) => setNewChecklistItem(e.target.value)} placeholder={`Nueva tarea para ${zones[selectedZoneForEdit].name}...`} style={{ flex: 1, padding: '0.6rem', border: '1px solid #d0d0d0', borderRadius: '6px', fontSize: '13px', color: '#999999', backgroundColor: '#FFFFFF' }} />
                      <button onClick={() => addChecklistItem(aptToEdit.id, selectedZoneForEdit)} style={{ padding: '0.6rem 1.25rem', backgroundColor: '#9C7C38', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>＋ Añadir</button>
                    </div>
                    <div style={{ backgroundColor: '#f9fafb', padding: '0.75rem', borderRadius: '6px' }}>
                      {Object.keys(aptToEdit.checklist[selectedZoneForEdit] || {}).length === 0 ? (
                        <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>Sin tareas en esta zona.</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          {Object.keys(aptToEdit.checklist[selectedZoneForEdit]).map(item => (
                            <div key={item} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', padding: '0.5rem 0.75rem', borderRadius: '4px', border: '1px solid #e5e7eb' }}>
                              <span style={{ fontSize: '13px' }}>{item}</span>
                              <button onClick={() => deleteChecklistItem(aptToEdit.id, selectedZoneForEdit, item)} style={{ border: 'none', backgroundColor: 'transparent', color: '#ef4444', cursor: 'pointer' }}>🗑️</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* EDITAR INVENTARIO */}
                  <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 0.5rem 0' }}>Inventario</h3>

                    {/* Agregar nuevo artículo */}
                    <div style={{ backgroundColor: '#f9fafb', padding: '1rem', borderRadius: '6px', marginBottom: '1rem', border: '1px solid #e5e7eb' }}>
                      <h4 style={{ fontSize: '13px', fontWeight: 600, margin: '0 0 1rem 0' }}>➕ Nuevo Artículo</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <div>
                          <label style={{ fontSize: '11px', fontWeight: 500, display: 'block', marginBottom: '0.25rem' }}>Nombre</label>
                          <input type="text" value={newInvLabel} onChange={(e) => setNewInvLabel(e.target.value)} placeholder="Toallas" style={{ color: '#999999', backgroundColor: '#FFFFFF', width: '100%', padding: '0.5rem', border: '1px solid #d0d0d0', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '11px', fontWeight: 500, display: 'block', marginBottom: '0.25rem' }}>Emoji</label>
                          <input type="text" value={newInvIcon} onChange={(e) => setNewInvIcon(e.target.value)} style={{ color: '#999999', backgroundColor: '#FFFFFF', width: '100%', padding: '0.5rem', border: '1px solid #d0d0d0', borderRadius: '4px', fontSize: '16px', boxSizing: 'border-box', textAlign: 'center' }} />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <div>
                          <label style={{ fontSize: '11px', fontWeight: 500, display: 'block', marginBottom: '0.25rem' }}>Stock Mínimo</label>
                          <input type="number" value={newInvMin} onChange={(e) => setNewInvMin(e.target.value)} min="0" style={{ color: '#999999', backgroundColor: '#FFFFFF', width: '100%', padding: '0.5rem', border: '1px solid #d0d0d0', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '11px', fontWeight: 500, display: 'block', marginBottom: '0.25rem' }}>Stock Actual</label>
                          <input type="number" value={newInvCurrent} onChange={(e) => setNewInvCurrent(e.target.value)} min="0" style={{ color: '#999999', backgroundColor: '#FFFFFF', width: '100%', padding: '0.5rem', border: '1px solid #d0d0d0', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }} />
                        </div>
                      </div>
                      <button onClick={() => addInventoryItem(aptToEdit.id)} style={{ width: '100%', padding: '0.6rem', backgroundColor: '#9C7C38', color: '#FFFFFF', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Agregar Artículo</button>
                    </div>

                    {/* Listar artículos existentes */}
                    <h4 style={{ fontSize: '13px', fontWeight: 600, margin: '0 0 0.75rem 0' }}>Artículos Actuales</h4>
                    {Object.entries(aptToEdit.inventory).length === 0 ? (
                      <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0, textAlign: 'center', padding: '1rem' }}>Sin artículos. Agrega uno arriba.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {Object.entries(aptToEdit.inventory).map(([key, item]) => (
                          <div key={key} style={{ backgroundColor: '#FFFFFF', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.75rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                              <div>
                                <p style={{ fontSize: '13px', fontWeight: 600, margin: 0 }}>{item.icon} {item.label}</p>
                              </div>
                              <button onClick={() => deleteInventoryItem(aptToEdit.id, key)} style={{ border: 'none', backgroundColor: '#fee2e2', color: '#991b1b', padding: '0.25rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>🗑️ Eliminar</button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
                              <div>
                                <label style={{ fontSize: '11px', fontWeight: 500, display: 'block', marginBottom: '0.25rem', color: '#626262' }}>Stock Mínimo</label>
                                <input
                                  type="number"
                                  defaultValue={item.min}
                                  onBlur={(e) => updateInventoryItem(aptToEdit.id, key, { min: parseInt(e.target.value) || 0 })}
                                  min="0"
                                  style={{ color: '#999999', backgroundColor: '#FFFFFF', width: '100%', padding: '0.5rem', border: '1px solid #d0d0d0', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }}
                                />
                              </div>
                              <div>
                                <label style={{ fontSize: '11px', fontWeight: 500, display: 'block', marginBottom: '0.25rem', color: '#626262' }}>Stock Actual</label>
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
                                    backgroundColor: item.current < item.min ? '#fee2e2' : '#FFFFFF'
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
                <h2 style={{ color: '#000000', fontSize: '16px', fontWeight: 600, marginBottom: '1rem' }}>Configuración</h2>
                <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 1rem 0' }}>➕ Nuevo apartamento</h3>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <input type="text" value={newApartmentName} onChange={(e) => setNewApartmentName(e.target.value)} placeholder="Ej: Apartamento C" style={{ backgroundColor: '#FFFFFF', color: '#999999', flex: 1, padding: '0.75rem', border: '1px solid #d0d0d0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
                    <button onClick={createApartment} disabled={!newApartmentName.trim()} style={{ padding: '0.75rem 1.5rem', backgroundColor: newApartmentName.trim() ? '#9C7C38' : '#D0D0D0', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: newApartmentName.trim() ? 'pointer' : 'not-allowed' }}>Crear</button>
                  </div>
                </div>

                <h3 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 1rem 0' }}>Mis Apartamentos</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
                  {apartments.map(apt => {
                    const lowStock = getLowStockItems(apt);
                    return (
                      <div key={apt.id} style={{ backgroundColor: '#FFFFFF', border: lowStock.length > 0 ? '2px solid #fcd34d' : '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem' }}>
                        <h4 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 0.5rem 0', color: '#1A1A1A' }}>{apt.name}</h4>
                        <p style={{ fontSize: '12px', color: '#626262', margin: '0 0 0.75rem 0' }}>Zonas: {Object.keys(apt.checklist).length} | Artículos: {Object.keys(apt.inventory).length}</p>
                        {lowStock.length > 0 && (
                          <div style={{ fontSize: '11px', color: '#f59e0b', marginBottom: '0.75rem', padding: '0.5rem', backgroundColor: '#fffbeb', borderRadius: '4px' }}>
                            ⚠️ {lowStock.length} artículo(s) con stock bajo
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button onClick={() => { setEditingApartmentId(apt.id); setEditingNameValue(apt.name); }} style={{ flex: 1, padding: '0.5rem', backgroundColor: '#F9F5F0', color: '#8B6F2C', border: '2px solid #9C7C38', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.5px', transition: 'all 0.3s' }}>Editar</button>
                          <button onClick={() => { if (window.confirm(`¿Eliminar ${apt.name}?`)) deleteApartment(apt.id); }} style={{ padding: '0.5rem 0.75rem', backgroundColor: '#DC2626', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Eliminar</button>
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
    <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '3rem', textAlign: 'center', maxWidth: '600px', margin: '2rem auto' }}>
      <div style={{ fontSize: '48px', marginBottom: '1rem' }}>📊</div>
      <h2 style={{ fontSize: '24px', fontWeight: 600, margin: '0 0 1rem 0', color: '#1A1A1A' }}>Revenue Analysis</h2>
      <p style={{ fontSize: '14px', color: '#626262', margin: '0 0 2rem 0', lineHeight: 1.6 }}>Este módulo está en desarrollo. Aquí se incluirán análisis de ingresos, reportes de ocupación, métricas de desempeño y más.</p>
      <div style={{ backgroundColor: '#f0f4ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '1.5rem' }}>
        <p style={{ fontSize: '13px', color: '#1e40af', margin: 0, lineHeight: 1.6 }}><strong>Estado:</strong> Próximos pasos<br />• Integración con datos de ocupación<br />• Cálculos de ingresos por propiedad<br />• Gráficas de tendencias<br />• Reportes exportables</p>
      </div>
    </div>
  );
};

// ============ APP PRINCIPAL ============
const CleanCheckRPM = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(() => localStorage.getItem('isLoggedIn') === 'true');
  const [userRole, setUserRole] = useState(() => localStorage.getItem('userRole'));
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [currentModule, setCurrentModule] = useState('cleaning-check');

  useEffect(() => {
    localStorage.setItem('isLoggedIn', isLoggedIn);
    localStorage.setItem('userRole', userRole || '');
  }, [isLoggedIn, userRole]);

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
      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('userRole', role);
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

    // Capturamos si hay datos de un servicio en curso antes del borrado
    const serviceStarted = localStorage.getItem('serviceStarted');
    const activeReportId = localStorage.getItem('activeReportId');
    const currentApartmentId = localStorage.getItem('currentApartmentId');
    const workerName = localStorage.getItem('workerName');
    const startTime = localStorage.getItem('startTime');

    localStorage.clear(); // Limpia sesiones de usuario y credenciales

    // Si había un servicio activo, volvemos a inyectar sus variables
    if (serviceStarted === 'true') {
      localStorage.setItem('serviceStarted', 'true');
      localStorage.setItem('activeReportId', activeReportId);
      localStorage.setItem('currentApartmentId', currentApartmentId);
      localStorage.setItem('workerName', workerName);
      localStorage.setItem('startTime', startTime);
    }

    setLoginUsername('');
    setLoginPassword('');
    setCurrentModule('cleaning-check');
  };

  if (!isLoggedIn) {
    return (
      <div style={{ fontFamily: '"Poppins", system-ui, sans-serif', backgroundColor: '#FAFAFA', minHeight: '100vh', padding: '0', color: '#1A1A1A' }}>
        {/* Estilos globales responsivos para parches específicos en móviles */}
        <style>{`
      @media (max-width: 600px) {
        .responsive-header { flex-direction: column; align-items: center; text-align: center; gap: 1.25rem; }
        .responsive-container { padding: 1rem 0.5rem !important; }
        h1 { font-size: 18px !important; }
      }
    `}</style>

        <div style={{ backgroundColor: '#FFFFFF', borderBottom: '1px solid #E5E5E5', padding: '1.5rem 1rem', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div style={{ border: '2px solid #9C7C38', color: '#9C7C38', borderRadius: '50%', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', margin: '0 auto 1rem' }}>✦</div>
            <h1 style={{ fontSize: '26px', fontWeight: 600, margin: '0 0 0.5rem 0', color: '#1A1A1A', letterSpacing: '0.5px' }}>Home Quality</h1>
            <p style={{ fontSize: '11px', color: '#9C7C38', margin: 0, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>Property Management System</p>
          </div>
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '0.6rem', color: '#1A1A1A', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Usuario</label>
              <input type="text" value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleLogin('employee')} placeholder="Ingresa tu usuario" style={{ width: '100%', padding: '0.8rem', border: '2px solid #E5E5E5', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', fontFamily: 'inherit', backgroundColor: '#FFFFFF', color: '#1A1A1A' }} />
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '0.6rem', color: '#1A1A1A', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Contraseña</label>
              <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleLogin('employee')} placeholder="Ingresa tu contraseña" style={{ width: '100%', padding: '0.8rem', border: '1px solid #E5E5E5', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', fontFamily: 'inherit', backgroundColor: '#FFFFFF', color: '#1A1A1A' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              <button onClick={() => handleLogin('employee')} style={{ padding: '0.85rem', backgroundColor: '#8B6F2C', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.3s', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Staff de Limpieza</button>
              <button onClick={() => handleLogin('owner')} style={{ padding: '0.85rem', backgroundColor: '#2D2D2D', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.3s', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Administrador</button>
            </div>
          </div>
          <div style={{ backgroundColor: '#F9F5F0', border: '1px solid #9C7C38', borderRadius: '6px', padding: '1rem', fontSize: '11px', color: '#9C7C38' }}>
            <strong style={{ display: 'block', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Credenciales Demo:</strong>
            <div style={{ lineHeight: 1.7 }}>
              <div>🧹 Staff: <code style={{ backgroundColor: '#9C7C38', padding: '0.25rem 0.5rem', borderRadius: '3px', fontFamily: 'monospace', fontSize: '10px' }}>aseo / 1234</code></div>
              <div>👤 Admin: <code style={{ backgroundColor: '#9C7C38', padding: '0.25rem 0.5rem', borderRadius: '3px', fontFamily: 'monospace', fontSize: '10px' }}>propietario / 1234</code></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: '"Poppins", system-ui, sans-serif', backgroundColor: '#FAFAFA', minHeight: '100vh', padding: '0', color: '#1A1A1A' }}>
      <div style={{ backgroundColor: '#FFFFFF', borderBottom: '1px solid #E5E5E5', padding: '1.5rem 1rem', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div className="responsive-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', maxWidth: '1200px', margin: '0 auto', marginBottom: userRole === 'owner' ? '1.5rem' : '0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {/* Logo Icono Premium */}
            <div style={{ border: '2px solid #9C7C38', color: '#9C7C38', borderRadius: '50%', width: '42px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>✦</div>
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: 600, margin: '0', color: '#1A1A1A', letterSpacing: '0.5px' }}>Home Quality</h1>
              <p style={{ fontSize: '10px', color: '#9C7C38', margin: '0.25rem 0 0 0', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>Revenue Property Management System</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '12px', fontWeight: 500, color: '#626262', border: '1px solid #E5E5E5', padding: '0.4rem 0.8rem', borderRadius: '20px' }}>
              {userRole === 'employee' ? '🧹 Staff de Limpieza' : '👤 Propietario'}
            </span>
            <button onClick={handleLogout} style={{ padding: '0.4rem 1rem', backgroundColor: 'transparent', color: '#1A1A1A', border: '1px solid #1A1A1A', borderRadius: '20px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.3s' }}>Cerrar sesión</button>
          </div>
        </div>

        {userRole === 'owner' && (
          <div style={{ display: 'flex', gap: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
            <button onClick={() => setCurrentModule('cleaning-check')} style={{ padding: '0.6rem 0', backgroundColor: 'transparent', border: 'none', borderBottom: currentModule === 'cleaning-check' ? '3px solid #8B6F2C' : '3px solid transparent', color: currentModule === 'cleaning-check' ? '#1A1A1A' : '#525252', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, cursor: 'pointer', transition: 'color 0.3s' }}>Operación & Calidad</button>
            <button onClick={() => setCurrentModule('revenue-analysis')} style={{ padding: '0.5rem 0', backgroundColor: 'transparent', border: 'none', borderBottom: currentModule === 'revenue-analysis' ? '3px solid #8B6F2C' : '3px solid transparent', color: currentModule === 'revenue-analysis' ? '#1A1A1A' : '#525252', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, cursor: 'pointer', transition: 'color 0.3s' }}>Análisis Financiero</button>
          </div>
        )}
      </div>

      <div className="responsive-container" style={{ padding: '2rem 1rem', maxWidth: '1200px', margin: '0 auto' }}>
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