sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/core/format/DateFormat"
],
function (Controller, JSONModel, Filter, FilterOperator, MessageToast, MessageBox, DateFormat) {
    "use strict";

    return Controller.extend("zfiori.ztms.inps.app.controller.InspectionRequest", {

        onInit: function () {
            // JSON model holding the entity set data (array at root)
            this.getView().setModel(new JSONModel([]), "inspModel");
            this._loadInspectionData();
            this.getOwnerComponent().getRouter()
                .getRoute("RouteInspectionRequest")
                .attachPatternMatched(function () {
                    this._loadInspectionData();
                }, this);
        },

         
        _loadInspectionData: function () {
            var oODataModel = this.getOwnerComponent().getModel(); // default OData V2 model
            var oView = this.getView();
            var oMode = this.getOwnerComponent().getModel("appMode").getData();
            var sStatus = oMode.isSupervisor ? "S" : "P";   // S = submitted, waiting for the supervisor (adjust to your status values)

            oODataModel.read("/inspHead", {
                filters: [new Filter("status", FilterOperator.EQ, sStatus   )],   // pending only
                success: function (oData) {
                    oView.getModel("inspModel").setData(oData.results);
                    oView.setBusy(false);
                },
                error: function (oError) {
                    oView.setBusy(false);
                    sap.m.MessageBox.error("Failed to load data: " + oError.message);
                }
            });
        },
        _parseTime: function (vTime) {
            var iMs;

            if (vTime === null || vTime === undefined || vTime === "") { return null; }

            if (typeof vTime === "object" && vTime.ms !== undefined) {
                iMs = vTime.ms;                       // Edm.Time from the OData V2 model
            } else if (typeof vTime === "number") {
                iMs = vTime;
            } else if (typeof vTime === "string") {
                var aIso = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(vTime);
                if (aIso) {
                    return {
                        h: parseInt(aIso[1] || 0, 10),
                        m: parseInt(aIso[2] || 0, 10),
                        s: parseInt(aIso[3] || 0, 10)
                    };
                }
                var aParts = vTime.split(":");        // "HH:MM:SS"
                return {
                    h: parseInt(aParts[0] || 0, 10),
                    m: parseInt(aParts[1] || 0, 10),
                    s: parseInt(aParts[2] || 0, 10)
                };
            } else {
                return null;
            }

            return {
                h: Math.floor(iMs / 3600000),
                m: Math.floor((iMs % 3600000) / 60000),
                s: Math.floor((iMs % 60000) / 1000)
            };
        },
        onFilterChange: function () {
            var that = this;
            var aFilters = [];
            var sVendor = this.byId("filterVendor").getValue().trim();
            var sPO = this.byId("filterPONumber").getValue().trim();
            var sTruck = this.byId("filterTruckNumber").getValue().trim();
            var oDate = this.byId("filterCheckInDate").getDateValue();
            var oTimeFilter = this.byId("filterCheckInTime").getDateValue();

            if (sVendor) {
                aFilters.push(new Filter("vendorCode", FilterOperator.Contains, sVendor));
            }
            if (sPO) {
                aFilters.push(new Filter("poNo", FilterOperator.Contains, sPO));
            }
            if (sTruck) {
                aFilters.push(new Filter("truckReg", FilterOperator.Contains, sTruck));
            }
            // Date only
            if (oDate) {
                aFilters.push(new Filter({
                    path: "creaDate",
                    test: function (oValue) {
                        if (!oValue) { return false; }
                        var oItemDate = new Date(oValue);
                        return oItemDate.getFullYear() === oDate.getFullYear() &&
                            oItemDate.getMonth() === oDate.getMonth() &&
                            oItemDate.getDate() === oDate.getDate();
                    }
                }));
            }

            // Time only (hour + minute)
            if (oTimeFilter) {
                aFilters.push(new Filter({
                    path: "creaTime",
                    test: function (vTime) {
                        var oTime = that._parseTime(vTime);
                        if (!oTime) { return false; }
                        return oTime.h === oTimeFilter.getHours() &&
                            oTime.m === oTimeFilter.getMinutes();
                    }
                }));
            }

            this.byId("table").getBinding("items").filter(
                aFilters.length ? new Filter({ filters: aFilters, and: true }) : []
            );
        },

        /* ============ CLEAR FILTER ============ */
        onClearFilters: function () {
            this.byId("filterVendor").setValue("");
            this.byId("filterPONumber").setValue("");
            this.byId("filterTruckNumber").setValue("");
            this.byId("filterCheckInDate").setValue("");
            this.byId("filterCheckInTime").setValue("");
            this.byId("table").getBinding("items").filter([]);
        },

        
        onSelectionChange: function () {
            // handle selection
        },

        onEditRequest: function (oEvent) {
            var oItem = oEvent.getSource().getBindingContext("inspModel").getObject();
            this.getOwnerComponent().getRouter().navTo("RouteInspectionForm", {
                inspReq: oItem.inspReq
            });
        },
        formatDate: function (vDate) {
            if (!vDate) { return ""; }

            // Handle "/Date(1700000000000)/" strings just in case
            if (typeof vDate === "string") {
                var aMatch = /\/Date\((-?\d+)\)\//.exec(vDate);
                vDate = aMatch ? new Date(parseInt(aMatch[1], 10)) : new Date(vDate);
            }
            if (!(vDate instanceof Date) || isNaN(vDate.getTime())) { return ""; }

            // creaDate is date-only at UTC midnight, so format in UTC
            return DateFormat.getDateInstance({ style: "medium", UTC: true }).format(vDate);
        },

        formatTime: function (vTime) {
            var oTime = this._parseTime(vTime);
            if (!oTime) { return ""; }

            var pad = function (n) { return String(n).padStart(2, "0"); };
            var sPeriod = oTime.h < 12 ? "AM" : "PM";
            var iHour12 = oTime.h % 12 || 12;   // 0 -> 12, 13 -> 1

            return pad(iHour12) + ":" + pad(oTime.m) + ":" + pad(oTime.s) + " " + sPeriod;
        },
        // Returns a Date (UTC midnight) from a Date object or a "/Date(ms)/" string, else null
        _parseDate: function (vDate) {
            if (!vDate) { return null; }

            if (typeof vDate === "string") {
                var aMatch = /\/Date\((-?\d+)\)\//.exec(vDate);
                vDate = aMatch ? new Date(parseInt(aMatch[1], 10)) : new Date(vDate);
            }
            return (vDate instanceof Date && !isNaN(vDate.getTime())) ? vDate : null;
        },
    });
});