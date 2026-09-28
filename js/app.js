import { STOCK_CATEGORIES, DATE_CATEGORIES } from './config.js';
import { fetchHouseholdData, saveHouseholdData } from './api.js';

const { createApp, ref, computed, onMounted } = Vue;

createApp({
  setup() {
    const activeTab = ref('inventory');
    const loading = ref(false);
    const saving = ref(false);
    const errorMessage = ref('');
    const lastSynced = ref('');

    // Filters
    const filterLowStock = ref(false);
    const selectedCategoryFilter = ref('ALL');
    const selectedDateTypeFilter = ref('ALL');
    const selectedDateCategoryFilter = ref('ALL');

    // Visibility & Edit States
    const showAddInventory = ref(false);
    const showAddReminder = ref(false);
    const editingInv = ref(null);
    const editInvForm = ref({ id: '', name: '', category: '', unit: '', quantity: 0, minQuantity: 0 });
    const editingRem = ref(null);
    const editRemForm = ref({ id: '', type: 'ANNUAL', title: '', category: '', targetDate: '', notes: '', notifyDaysBefore: 7 });

    const data = ref({ inventory: [], reminders: [] });
    const newInv = ref({ name: '', category: 'Others', quantity: 1, unit: 'pkts', minQuantity: 1 });
    const newRem = ref({ type: 'ANNUAL', title: '', category: 'Birthdays & Anniversaries', targetDate: '', notes: '', notifyDaysBefore: 7 });

    // Fetch Data
    const fetchData = async () => {
      loading.value = true;
      errorMessage.value = '';
      try {
        const result = await fetchHouseholdData();
        data.value = {
          inventory: result.inventory || [],
          reminders: result.reminders || []
        };
        lastSynced.value = new Date().toLocaleTimeString();
      } catch (err) {
        errorMessage.value = err.message || 'Error syncing data.';
      } finally {
        loading.value = false;
      }
    };

    // Save Data
    const saveData = async () => {
      saving.value = true;
      errorMessage.value = '';
      try {
        await saveHouseholdData(data.value);
        lastSynced.value = new Date().toLocaleTimeString();
      } catch (err) {
        errorMessage.value = err.message || 'Error saving updates.';
      } finally {
        saving.value = false;
      }
    };

    // Inventory Handlers
    const updateQuantity = (item, delta) => {
      const updatedVal = item.quantity + delta;
      if (updatedVal >= 0) {
        item.quantity = updatedVal;
        item.updatedAt = new Date().toISOString().split('T')[0];
        saveData();
      }
    };

    const addInventoryItem = () => {
      data.value.inventory.push({
        id: 'inv_' + Date.now(),
        ...newInv.value,
        updatedAt: new Date().toISOString().split('T')[0]
      });
      saveData();
      newInv.value = { name: '', category: 'Others', quantity: 1, unit: 'pkts', minQuantity: 1 };
      showAddInventory.value = false;
    };

    const startEditInv = (item) => {
      showAddInventory.value = false;
      editingInv.value = item.id;
      editInvForm.value = { ...item };
    };

    const cancelEditInv = () => { editingInv.value = null; };

    const saveEditInventory = () => {
      const idx = data.value.inventory.findIndex(i => i.id === editingInv.value);
      if (idx !== -1) {
        data.value.inventory[idx] = {
          ...editInvForm.value,
          updatedAt: new Date().toISOString().split('T')[0]
        };
        saveData();
      }
      editingInv.value = null;
    };

    const deleteInventoryItem = (id) => {
      if (confirm('Delete this stock item?')) {
        data.value.inventory = data.value.inventory.filter(i => i.id !== id);
        saveData();
      }
    };

    // Reminder Handlers
    const addReminderItem = () => {
      data.value.reminders.push({ id: 'rem_' + Date.now(), ...newRem.value });
      saveData();
      newRem.value = { type: 'ANNUAL', title: '', category: 'Birthdays & Anniversaries', targetDate: '', notes: '', notifyDaysBefore: 7 };
      showAddReminder.value = false;
    };

    const startEditRem = (rem) => {
      showAddReminder.value = false;
      editingRem.value = rem.id;
      editRemForm.value = { ...rem };
    };

    const cancelEditRem = () => { editingRem.value = null; };

    const saveEditReminder = () => {
      const idx = data.value.reminders.findIndex(r => r.id === editingRem.value);
      if (idx !== -1) {
        data.value.reminders[idx] = { ...editRemForm.value };
        saveData();
      }
      editingRem.value = null;
    };

    const deleteReminderItem = (id) => {
      if (confirm('Delete this date/reminder?')) {
        data.value.reminders = data.value.reminders.filter(r => r.id !== id);
        saveData();
      }
    };

    // Computed Properties
    const filteredInventory = computed(() => {
      return data.value.inventory.filter(item => {
        const matchesCategory = selectedCategoryFilter.value === 'ALL' || item.category === selectedCategoryFilter.value;
        const matchesLowStock = !filterLowStock.value || (item.quantity <= item.minQuantity);
        return matchesCategory && matchesLowStock;
      });
    });

    const sortedReminders = computed(() => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      return data.value.reminders
        .filter(rem => {
          const remType = rem.type || 'FIXED';
          const matchesType = selectedDateTypeFilter.value === 'ALL' || remType === selectedDateTypeFilter.value;
          const matchesCategory = selectedDateCategoryFilter.value === 'ALL' || rem.category === selectedDateCategoryFilter.value;
          return matchesType && matchesCategory;
        })
        .map(rem => {
          const itemType = rem.type || 'FIXED';
          const origDate = new Date(rem.targetDate);
          let nextTarget = new Date(rem.targetDate);
          let milestoneText = '';
          let diffDays = 0;
          let computedStatus = 'OK';

          if (itemType === 'ANNUAL') {
            const currentYear = today.getFullYear();
            nextTarget = new Date(currentYear, origDate.getMonth(), origDate.getDate());
            if (nextTarget < today) nextTarget.setFullYear(currentYear + 1);

            const milestoneNum = nextTarget.getFullYear() - origDate.getFullYear();
            milestoneText = `Turning ${milestoneNum}`;
            diffDays = Math.ceil((nextTarget - today) / (1000 * 60 * 60 * 24));
          } else {
            diffDays = Math.ceil((origDate - today) / (1000 * 60 * 60 * 24));
            if (diffDays <= 0) computedStatus = 'EXPIRED';
            else if (diffDays <= rem.notifyDaysBefore) computedStatus = 'DUE_SOON';
          }

          let displayCountdown = '';
          if (diffDays === 0) displayCountdown = 'Due Today 🎉';
          else if (diffDays < 0) displayCountdown = `Past due by ${Math.abs(diffDays)} day(s)`;
          else displayCountdown = `In ${diffDays} day(s)`;

          return {
            ...rem,
            type: itemType,
            nextTargetFormatted: nextTarget.toISOString().split('T')[0],
            diffDays,
            milestoneText,
            computedStatus,
            displayCountdown
          };
        })
        .sort((a, b) => a.diffDays - b.diffDays);
    });

    onMounted(fetchData);

    return {
      STOCK_CATEGORIES, DATE_CATEGORIES,
      activeTab, loading, saving, errorMessage, lastSynced,
      filterLowStock, selectedCategoryFilter, selectedDateTypeFilter, selectedDateCategoryFilter,
      showAddInventory, showAddReminder, data, newInv, newRem,
      editingInv, editInvForm, startEditInv, cancelEditInv, saveEditInventory,
      editingRem, editRemForm, startEditRem, cancelEditRem, saveEditReminder,
      fetchData, updateQuantity, addInventoryItem, deleteInventoryItem,
      addReminderItem, deleteReminderItem, filteredInventory, sortedReminders
    };
  }
}).mount('#app');