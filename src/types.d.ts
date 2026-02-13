export {};

declare global {
  interface Window {
    pos: {
      /* =========================
         CONFIG
         ========================= */
      saveConfig: (key: string, value: any) => Promise<void>;
      getConfig: (key: string) => Promise<any>;
      getPosMode: () => Promise<'HOST' | 'CLIENT' | null>;

      /* =========================
         READ (LOCAL DB)
         ========================= */
      getStaff?: () => Promise<any[]>;
      getMenu?: () => Promise<any[]>;
      getFloors?: () => Promise<any[]>;

      /* =========================
         ORDER / BILLING (POS CORE)
         ========================= */
      order: {
        /* ---- SESSION ---- */
        openTable: (
          tableId: string,
          employeeId: string
        ) => Promise<{ id: string }>;

        getOpenByTable: (
          tableId: string
        ) => Promise<{ id: string } | null>;

        getFullOrder: (orderId: string) => Promise<any>;

        /* ---- CART ---- */
        addItem: (args: {
          orderId: string | null;
          tableId: string;
          item: any;
          employeeId: string;
        }) => Promise<{ sessionId: string } | void>;

        updateQty: (args: {
          orderId: string;
          productId: string;
          qty: number;
          reason?: string;
          employeeId: string;
        }) => Promise<void>;

        /* ---- KOT ---- */
        addKOT: (args: {
          orderId: string;
          employeeId: string;
        }) => Promise<string | null>;

        adjustKOTItem: (args: {
          orderId: string;
          kotId: string;
          productId: string;
          qtyChange: number;
          reason: string;
          employeeId: string;
        }) => Promise<void>;

        /* ---- BILL PRINT ---- */
        markBillPrinted: (
          orderId: string,
          employeeId: string
        ) => Promise<void>;

        updateCartItemNote: (args: {
          sessionId: string;
          productId: string;
          note: string;
        }) => Promise<any>;

        /* ---- LEGACY SETTLEMENT ---- */
        finalizeSettlement: (args: {
          orderId: string;
          billAmount: number;
          paidAmount: number;
          paymentMode: string;
          employeeId: string;
        }) => Promise<void>;

        /* =========================
           ADVANCED BILLING (ADD-ONLY)
           ========================= */

        /* ---- SESSION META ---- */
        upsertSessionMeta: (args: {
          sessionId: string;
          orderType?: 'DINE_IN' | 'DELIVERY' | 'TAKEAWAY';
          customerId?: string | null;
          orderNote?: string | null;
          staffId: string;
        }) => Promise<void>;

        /* ---- BILLS ---- */
        createBill: (args: {
          sessionId: string;
          billType: 'FULL' | 'SPLIT';
          splitMethod?: 'NONE' | 'EQUAL' | 'PERCENTAGE' | 'ITEM';
          totalAmount: number;
          staffId: string;
        }) => Promise<{
          billId: string;
          billNo: number;
        }>;

        /* ---- DISCOUNTS ---- */
        applyDiscount: (args: {
          billId: string;
          type: 'FLAT' | 'PERCENT';
          value: number;
          reason: string;
          staffId: string;
        }) => Promise<void>;

        /* ---- PAYMENTS ---- */
        addPayment: (args: {
          billId: string;
          mode:
            | 'CASH'
            | 'CARD'
            | 'GPAY'
            | 'PHONEPE'
            | 'PAYTM'
            | 'DUE';
          amount: number;
          staffId: string;
        }) => Promise<void>;

        /* ---- BILL SETTLEMENT ---- */
        settleBill: (args: {
          billId: string;
          staffId: string;
        }) => Promise<void>;

        /* ---- FAST FLOW ---- */
        instantPaid: (args: {
          sessionId: string;
          totalAmount: number;
          staffId: string;
        }) => Promise<void>;

        /* ---- FULL SNAPSHOT ---- */
        loadFullBillingSession: (
          sessionId: string
        ) => Promise<any>;

        splitEqual: (args: {
          sessionId: string;
          splitCount: number;
          staffId: string;
        }) => Promise<{
          splitCount: number;
          perSplit: number;
        }>;

        getOpenSessionsByTable: (
          tableId: string
        ) => Promise<{
          id: string;
          table_id: string;
          status: string;
          parent_session_id: string | null;
          split_index: number | null;
        }[]>;

        getSplitChildren: (
          sessionId: string
        ) => Promise<{
          id: string;
          split_index: number;
          status: string;
        }[]>;

        loadSplitViewSession: (sessionId: string) => Promise<{
          kots: any[];
          adjustments: any[];
          settlement: {
            bill_amount: number;
          };
          splitIndex: number;
        }>;


      };

      /* =========================
         CLOUD → POS (HOST ONLY)
         ========================= */
      syncFromCloud: (
        type: 'STAFF' | 'MENU' | 'FLOORS' | 'TAX_GROUPS',
        payload: any
      ) => Promise<void>;

      /* =========================
         POS → CLOUD
         ========================= */
      logChange: (
        entity: string,
        entityId: string,
        action: 'CREATE' | 'UPDATE' | 'DELETE' | 'UPSERT',
        payload: any
      ) => Promise<void>;

      enqueueOutbox: (
        type: string,
        payload: any
      ) => Promise<void>;

      /* =========================
         HOST MODE
         ========================= */
      startServerMode?: () => Promise<{
        status: 'started';
        ip: string;
        port: number;
      }>;

      /* =========================
         PRINTING
         ========================= */
      printKOT?: (payload: {
        tableName: string;
        kotNo: number;
        time: string;
        items: {
          name: string;
          qty: number;
          price: number;
        }[];
      }) => Promise<boolean>;

      printBill?: (payload: {
        brandName: string;
        hotelName: string;
        billNo: number;
        date: string;
        tableName: string;
        items: {
          name: string;
          qty: number;
          price: number;
          total: number;
        }[];
        total: number;
      }) => Promise<boolean>;

      /* =========================
         LAN
         ========================= */
      discoverHost?: () => Promise<any>;
    };
  }
}
