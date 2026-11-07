sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/format/DateFormat",
    "sap/m/MessageToast",
    "sap/ui/core/Fragment",
    "sap/m/MessageBox",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"

], function (Controller, JSONModel, DateFormat, MessageToast, Fragment, MessageBox, Filter, FilterOperator) {
    "use strict";

    return Controller.extend("zfiori.ztms.inps.app.controller.InspectionForm", {

        onInit: function () {
            this.getView().setModel(new JSONModel([]), "sampleModel");
            this.getView().setModel(new JSONModel({ isEdit: false, isLocked: false, inspRes: [] }), "inspSample");
            this.getView().setModel(new JSONModel({ remarks: "" }), "supModel");

            this._pChars = this._read("/inspChars");

            this.getOwnerComponent().getRouter()
                .getRoute("RouteInspectionForm")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        /* ============ DATA LOADING ============ */

        _read: function (sPath, mUrlParams) {
            var oModel = this.getOwnerComponent().getModel();
            return new Promise(function (resolve, reject) {
                oModel.read(sPath, {
                    urlParameters: mUrlParams,
                    success: function (oData) { resolve(oData.results); },
                    error: reject
                });
            });
        },

        _onRouteMatched: function (oEvent) {
            var sInspReq = oEvent.getParameter("arguments").inspReq;
            this._sInspReq = sInspReq;
            this._aDeletedSamples = [];

            this.getView().bindElement({ path: "/inspHead('" + sInspReq + "')" });

            this._loadSampleData(sInspReq);

            this.getView().getModel("supModel").setData({ remarks: "" });

            this._pVenRes = this._read("/inspHead('" + sInspReq + "')/to_inspVenRes")
                .then(function (aRes) {
                    var mVen = {};
                    aRes.forEach(function (o) { mVen[o.micCode] = o.quanRes; });
                    return mVen;
                })
                .catch(function () { return {}; });
        },

        // Loads samples WITH their results (to_inspRes) so existing rows can be edited too.
        // Falls back to a plain read if the expand is not supported.
        _loadSampleData: function (sInspReq) {
            var oView = this.getView();
            var oSampleModel = oView.getModel("sampleModel");
            var sPath = "/inspHead('" + sInspReq + "')/to_inspSample";

            oSampleModel.setData([]);
            oView.setBusy(true);

            this._read(sPath, { "$expand": "to_inspRes" })
                .catch(function () { return this._read(sPath); }.bind(this))
                .then(function (aRes) {
                    aRes.forEach(function (o) {
                        // flatten { results: [...] } to a plain array
                        o.inspRes = (o.to_inspRes && o.to_inspRes.results) || [];
                        delete o.to_inspRes;
                    });
                    oSampleModel.setData(aRes);
                })
                .catch(function (oError) {
                    MessageBox.error("Failed to load samples: " + ((oError && oError.message) || ""));
                })
                .finally(function () {
                    oView.setBusy(false);
                });
        },

        _loadQcResults: function (sInspReq) {
            return this._read("/inspHead('" + sInspReq + "')/to_inspSample", { "$expand": "to_inspRes" })
                .then(function (aSamples) {
                    var mQc = {};
                    aSamples.forEach(function (oSample) {
                        var aRes = (oSample.to_inspRes && oSample.to_inspRes.results) || [];
                        aRes.forEach(function (oRes) { mQc[oRes.micCode] = oRes.quanRes; });
                    });
                    return mQc;
                })
                .catch(function () { return {}; });
        },

        /* ============ FORMATTERS ============ */

        formatTime: function (vTime) {
            if (!vTime || vTime.ms === undefined) { return ""; }
            var oFormat = DateFormat.getTimeInstance({ pattern: "HH:mm:ss", UTC: true });
            return oFormat.format(new Date(vTime.ms));
        },

        /* ============ NAVIGATION ============ */

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("RouteInspectionRequest");
        },

        /* ============ DIALOG HELPERS ============ */

        _getDialog: function () {
            var oView = this.getView();
            if (!this._pSampleDialog) {
                this._pSampleDialog = Fragment.load({
                    id: oView.getId(),
                    name: "zfiori.ztms.inps.app.fragments.CreateSample",
                    controller: this
                }).then(function (oDialog) {
                    oView.addDependent(oDialog);
                    return oDialog;
                });
            }
            return this._pSampleDialog;
        },

        // Row (UTC-midnight Date) -> local Date for the DatePicker
        _toLocalDate: function (vDate) {
            if (vDate instanceof Date && !isNaN(vDate.getTime())) {
                return new Date(vDate.getUTCFullYear(), vDate.getUTCMonth(), vDate.getUTCDate());
            }
            return new Date();
        },

        // Row ({ms}) -> local Date for the TimePicker
        _toLocalTime: function (vTime) {
            var d = new Date();
            if (vTime && vTime.ms !== undefined) {
                d.setHours(Math.floor(vTime.ms / 3600000),
                           Math.floor((vTime.ms % 3600000) / 60000),
                           Math.floor((vTime.ms % 60000) / 1000), 0);
            }
            return d;
        },

        // Characteristic rows for the dialog. mQc = { micCode: quanRes } for the QC column.
        _buildInspRes: function (aChars, mVen, mQc) {
            return (aChars || []).map(function (oChar, i) {
                return {
                    micSeq: String(i + 1),
                    micCode: oChar.micCode,                 // sent to backend
                    micText: oChar.micText,                 // display only
                    vendorRes: mVen[oChar.micCode] !== undefined ? mVen[oChar.micCode] : "",   // display only
                    quanRes: mQc[oChar.micCode] !== undefined ? mQc[oChar.micCode] : ""        // QC input
                };
            });
        },

        /* ============ CREATE ============ */

        // onCreateSample: function () {
        //     var oView = this.getView();

        //     var oCtx = oView.getBindingContext();
        //     var bPending = !!oCtx && oCtx.getProperty("status") === "P";
        //     var pQc = bPending ? Promise.resolve({}) : this._loadQcResults(this._sInspReq);

        //     this._iEditIndex = -1;

        //     oView.setBusy(true);
        //     Promise.all([this._getDialog(), this._pChars, this._pVenRes, pQc])
        //         .then(function (a) {
        //             oView.getModel("inspSample").setData({
        //                 isEdit: false,
        //                 isNew: true,
        //                 isLocked: false,
        //                 sampleNo: "",
        //                 sampleQty: "",
        //                 uom: "",
        //                 remarks: "",
        //                 creaUser: "",
        //                 creaDate: new Date(),
        //                 creaTime: new Date(),
        //                 inspRes: this._buildInspRes(a[1], a[2], a[3])
        //             });
        //             a[0].open();
        //         }.bind(this))
        //         .catch(function (oError) {
        //             MessageBox.error((oError && oError.message) || "Could not open the sample form");
        //         })
        //         .finally(function () { oView.setBusy(false); });
        // },
        onCreateSample: function () {
            var oView = this.getView();

            this._iEditIndex = -1;

            oView.setBusy(true);
            Promise.all([this._getDialog(), this._pChars, this._pVenRes])
                .then(function (a) {
                    oView.getModel("inspSample").setData({
                        isEdit: false,
                        isNew: true,
                        isLocked: false,
                        isDeleted: false,
                        sampleNo: "",
                        sampleQty: "",
                        uom: "",
                        remarks: "",
                        creaUser: "",
                        creaDate: new Date(),
                        creaTime: new Date(),
                        inspRes: this._buildInspRes(a[1], a[2], {})   // {} = QC results start empty
                    });
                    a[0].open();
                }.bind(this))
                .catch(function (oError) {
                    MessageBox.error((oError && oError.message) || "Could not open the sample form");
                })
                .finally(function () { oView.setBusy(false); });
        },       


        _buildInspResFromRow: function (aRowRes, aChars, mVen) {
            var mText = {};
            (aChars || []).forEach(function (c) { mText[c.micCode] = c.micText; });

            return (aRowRes || []).map(function (r, i) {
                return {
                    micSeq: r.micSeq || String(i + 1),
                    micCode: r.micCode,                                            // sent to backend
                    micText: r.micText || mText[r.micCode] || "",                  // display only
                    vendorRes: mVen[r.micCode] !== undefined ? mVen[r.micCode] : "",   // display only
                    quanRes: r.quanRes !== undefined && r.quanRes !== null ? r.quanRes : ""   // QC input
                };
            });
        },
        /* ============ EDIT ============ */

        // onEditSample: function (oEvent) {
        //     var oView = this.getView();
        //     var oCtx = oEvent.getSource().getBindingContext("sampleModel");
        //     var oRow = oCtx.getObject();
        //     this._iEditIndex = parseInt(oCtx.getPath().substring(1), 10);

        //     // existing result values of this sample, by micCode
        //     var mQc = {};
        //     (oRow.inspRes || []).forEach(function (r) { mQc[r.micCode] = r.quanRes; });

        //     oView.setBusy(true);
        //     Promise.all([this._getDialog(), this._pChars, this._pVenRes])
        //         .then(function (a) {
        //             oView.getModel("inspSample").setData({
        //                 isEdit: true,
        //                 isNew: !!oRow.isNew,
        //                 isLocked: !oRow.isNew,   // rows already saved in the backend: only remarks + QC results editable
        //                 sampleNo: oRow.sampleNo,
        //                 sampleQty: oRow.sampleQty,
        //                 uom: oRow.uom,
        //                 remarks: oRow.remarks,
        //                 creaUser: oRow.creaUser,
        //                 creaDate: this._toLocalDate(oRow.creaDate),
        //                 creaTime: this._toLocalTime(oRow.creaTime),
        //                 inspRes: this._buildInspRes(a[1], a[2], mQc)
        //             });
        //             a[0].open();
        //         }.bind(this))
        //         .catch(function (oError) {
        //             MessageBox.error((oError && oError.message) || "Could not open the sample form");
        //         })
        //         .finally(function () { oView.setBusy(false); });
        // },
        onEditSample: function (oEvent) {
            var oView = this.getView();
            var oCtx = oEvent.getSource().getBindingContext("sampleModel");
            var oRow = oCtx.getObject();
            this._iEditIndex = parseInt(oCtx.getPath().substring(1), 10);

            oView.setBusy(true);
            Promise.all([this._getDialog(), this._pChars, this._pVenRes])
                .then(function (a) {
                    oView.getModel("inspSample").setData({
                        isEdit: true,
                        isNew: !!oRow.isNew,
                        isLocked: !oRow.isNew,
                        isDeleted: oRow.delFlg === "X",
                        sampleNo: oRow.sampleNo,
                        sampleQty: oRow.sampleQty,
                        uom: oRow.uom,
                        remarks: oRow.remarks,
                        creaUser: oRow.creaUser,
                        creaDate: this._toLocalDate(oRow.creaDate),
                        creaTime: this._toLocalTime(oRow.creaTime),
                        inspRes: this._buildInspResFromRow(oRow.inspRes, a[1], a[2])
                    });
                    a[0].open();
                }.bind(this))
                .catch(function (oError) {
                    MessageBox.error((oError && oError.message) || "Could not open the sample form");
                })
                .finally(function () { oView.setBusy(false); });
        },

        /* ============ ADD / UPDATE ============ */

        // Validates the dialog data and returns a row in the shape sampleModel uses (or null)
        _buildRowFromDialog: function () {
            var oData = this.getView().getModel("inspSample").getData();
            var sQty = String(oData.sampleQty || "").trim();

            if (!sQty || isNaN(sQty) || Number(sQty) <= 0) {
                MessageToast.show("Please enter a valid sample quantity");
                return null;
            }

            // All QC results must be filled
            var oInspModel = this.getView().getModel("inspSample");
            var bMissing = false;
            oData.inspRes.forEach(function (r) {
                var bEmpty = r.quanRes === undefined || r.quanRes === null || String(r.quanRes).trim() === "";
                r.qcError = bEmpty;          // drives the red border in the dialog
                if (bEmpty) { bMissing = true; }
            });
            oInspModel.refresh(true);

            if (bMissing) {
                MessageToast.show("Please fill all QC Results");
                return null;
            }

            var d = oData.creaDate || new Date();
            var t = oData.creaTime || new Date();
            var sInspReq = this._sInspReq;

            return {
                inspReq: sInspReq,
                sampleNo: oData.sampleNo || "",
                sampleQty: sQty,
                uom: oData.uom,
                remarks: oData.remarks,
                creaUser: oData.creaUser,
                creaDate: new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())),
                creaTime: {
                    ms: t.getHours() * 3600000 + t.getMinutes() * 60000 + t.getSeconds() * 1000,
                    __edmType: "Edm.Time"
                },
                isNew: !!oData.isNew,
                inspRes: oData.inspRes.map(function (r) {
                    return {
                        inspReq: sInspReq,
                        sampleNo: oData.sampleNo || "",
                        micSeq: r.micSeq,
                        micCode: r.micCode,      // only micCode goes to backend
                        quanRes: r.quanRes
                    };
                })
            };
        },

        onQcLiveChange: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("inspSample");
            if (oCtx) { oCtx.getModel().setProperty(oCtx.getPath() + "/qcError", false); }
        },

        onAddSample: function () {
            var oRow = this._buildRowFromDialog();
            if (!oRow) { return; }

            var oSampleModel = this.getView().getModel("sampleModel");
            oSampleModel.getData().push(oRow);
            oSampleModel.refresh(true);

            this.onCloseSample();
        },

        onUpdateSample: function () {
            var oRow = this._buildRowFromDialog();
            if (!oRow) { return; }

            var oSampleModel = this.getView().getModel("sampleModel");
            var aSamples = oSampleModel.getData();

            if (this._iEditIndex < 0 || this._iEditIndex >= aSamples.length) {
                MessageBox.error("The sample to update could not be found");
                return;
            }

            // existing (backend) rows are flagged so the later Save knows to send an update
            if (!oRow.isNew) { oRow.isChanged = true; }

            aSamples[this._iEditIndex] = oRow;
            oSampleModel.refresh(true);

            MessageToast.show("Sample updated");
            this.onCloseSample();
        },

        onCloseSample: function () {
            this._getDialog().then(function (oDialog) { oDialog.close(); });
        },

        // onDeleteSample: function (oEvent) {
        //     var oView = this.getView();
        //     var oSampleModel = oView.getModel("sampleModel");
        //     var oODataModel = this.getOwnerComponent().getModel();
        //     var oCtx = oEvent.getParameter("listItem").getBindingContext("sampleModel");
        //     var oRow = oCtx.getObject();
        //     var that = this;

        //     MessageBox.confirm("Delete sample " + (oRow.sampleNo || "(new)") + "?", {
        //         actions: [MessageBox.Action.DELETE, MessageBox.Action.CANCEL],
        //         emphasizedAction: MessageBox.Action.DELETE,
        //         onClose: function (sAction) {
        //             if (sAction !== MessageBox.Action.DELETE) { return; }
        //             if (oRow.delFlg === "X") {
        //                 MessageToast.show("This sample is already deleted");
        //                 return;
        //             }

        //             // removes the row from the table by reference (safe even if the list changed meanwhile)
        //             var fnRemoveLocal = function () {
        //                 var aSamples = oSampleModel.getData();
        //                 var iIndex = aSamples.indexOf(oRow);
        //                 if (iIndex > -1) { aSamples.splice(iIndex, 1); }
        //                 oSampleModel.refresh(true);
        //             };

        //             // Not saved yet: nothing to delete in the backend
        //             if (oRow.isNew || !oRow.sampleNo) {
        //                 fnRemoveLocal();
        //                 MessageToast.show("Sample deleted");
        //                 return;
        //             }

        //             oView.setBusy(true);
        //             oODataModel.create("/inspHead", {
        //                 action: "D",
        //                 inspReq: that._sInspReq,
        //                 to_inspSample: [{
        //                     inspReq: that._sInspReq,
        //                     sampleNo: oRow.sampleNo,
        //                     action: "D"
        //                 }]
        //             }, {
        //                 success: function () {
        //                     oView.setBusy(false);
        //                     fnRemoveLocal();

        //                     // the create response overwrites the cached header, so re-read it
        //                     var oBinding = oView.getElementBinding();
        //                     if (oBinding) { oBinding.refresh(true); }

        //                     MessageToast.show("Sample deleted");
        //                 },
        //                 error: function (oError) {
        //                     oView.setBusy(false);
        //                     MessageBox.error(that._getErrorMessage(oError));
        //                 }
        //             });
           
        //         }
        //     });
        // },
        onDeleteSample: function (oEvent) {
            var oView = this.getView();
            var oSampleModel = oView.getModel("sampleModel");
            var oODataModel = this.getOwnerComponent().getModel();
            var oCtx = oEvent.getParameter("listItem").getBindingContext("sampleModel");
            var oRow = oCtx.getObject();
            var that = this;

            // Already deleted: show an error and stop (before asking for confirmation)
            if (oRow.delFlg === "X") {
                MessageBox.error("Sample " + oRow.sampleNo + " is already deleted.");
                return;
            }

            MessageBox.confirm("Delete sample " + (oRow.sampleNo || "(new)") + "?", {
                actions: [MessageBox.Action.DELETE, MessageBox.Action.CANCEL],
                emphasizedAction: MessageBox.Action.DELETE,
                onClose: function (sAction) {
                    if (sAction !== MessageBox.Action.DELETE) { return; }

                    // Not saved yet: nothing in the backend, so just remove the local row
                    if (oRow.isNew || !oRow.sampleNo) {
                        var aSamples = oSampleModel.getData();
                        var iIndex = aSamples.indexOf(oRow);
                        if (iIndex > -1) { aSamples.splice(iIndex, 1); }
                        oSampleModel.refresh(true);
                        MessageToast.show("Sample deleted");
                        return;
                    }

                    oView.setBusy(true);
                    oODataModel.create("/inspHead", {
                        action: "D",
                        inspReq: that._sInspReq,
                        to_inspSample: [{
                            inspReq: that._sInspReq,
                            sampleNo: oRow.sampleNo,
                            action: "D"
                        }]
                    }, {
                        success: function () {
                            oView.setBusy(false);

                            // keep the row, just mark it as deleted
                            oRow.delFlg = "X";
                            oSampleModel.refresh(true);

                            // the create response overwrites the cached header, so re-read it
                            var oBinding = oView.getElementBinding();
                            if (oBinding) { oBinding.refresh(true); }

                            MessageToast.show("Sample deleted");
                        },
                        error: function (oError) {
                            oView.setBusy(false);
                            MessageBox.error(that._getErrorMessage(oError));
                        }
                    });
                }
            });
        },
        /* ============ FOOTER (not implemented yet) ============ */

       // Deep structure: header -> to_inspSample[] -> to_inspRes[]
        _buildSavePayload: function (aSamples) {
            var sInspReq = this._sInspReq;

            return {
                action: "",                       // blank = save
                inspReq: sInspReq,
                to_inspSample: aSamples.map(function (oRow) {
                    return {
                        inspReq: sInspReq,
                        sampleNo: oRow.sampleNo || "",        // blank for new rows, backend assigns it
                        remarks: oRow.remarks || "",
                        sampleQty: String(oRow.sampleQty),
                        uom: oRow.uom || "",
                        decision: oRow.decision || "",
                        to_inspRes: (oRow.inspRes || [])
                            .filter(function (r) {
                                return r.quanRes !== "" && r.quanRes !== null && r.quanRes !== undefined;
                            })
                            .map(function (r) {
                                return {
                                    inspReq: sInspReq,
                                    sampleNo: oRow.sampleNo || "",
                                    micSeq: r.micSeq,
                                    micCode: r.micCode,
                                    quanRes: String(r.quanRes)   // Edm.Decimal is sent as a string
                                };
                            })
                    };
                })
            };
        },
        // onSaveInspection: function () {
        //     var oView = this.getView();
        //     var oODataModel = this.getOwnerComponent().getModel();   // default OData V2 model
        //     var aSamples = oView.getModel("sampleModel").getData();

        //     if (!aSamples.length) {
        //         MessageToast.show("Please add at least one sample before saving");
        //         return;
        //     }

        //     var oPayload = this._buildSavePayload(aSamples);

        //     oView.setBusy(true);
        //     oODataModel.create("/inspHead", oPayload, {
        //         success: function () {
        //             // oView.setBusy(false);
        //             this._aDeletedSamples = [];
        //             MessageToast.show("Inspection saved");

        //             var oBinding = oView.getElementBinding();
        //             if (oBinding) { oBinding.refresh(true); }
        //             this._loadSampleData(this._sInspReq);   // reload so new rows get their sample numbers
        //         }.bind(this),
        //         error: function (oError) {
        //             oView.setBusy(false);
        //             MessageBox.error(this._getErrorMessage(oError));
        //         }.bind(this)
        //     });
        // },
        onSaveInspection: function () {
            this._saveInspection(false);
        },

        _saveInspection: function (bSilent) {
            var oView = this.getView();
            var oODataModel = this.getOwnerComponent().getModel();
            var aSamples = oView.getModel("sampleModel").getData();

            if (!aSamples.length) {
                MessageToast.show("Please add at least one sample before saving");
                return Promise.resolve(false);
            }

            var oPayload = this._buildSavePayload(aSamples);

            return new Promise(function (resolve) {
                oView.setBusy(true);
                oODataModel.create("/inspHead", oPayload, {
                    success: function () {
                        this._aDeletedSamples = [];
                        if (bSilent) {
                            resolve(true);
                            return;
                        }
                        MessageToast.show("Inspection saved");
                        var oBinding = oView.getElementBinding();
                        if (oBinding) { oBinding.refresh(true); }
                        this._loadSampleData(this._sInspReq);   // clears busy when done
                        resolve(true);
                    }.bind(this),
                    error: function (oError) {
                        oView.setBusy(false);
                        MessageBox.error(this._getErrorMessage(oError));
                        resolve(false);
                    }.bind(this)
                });
            }.bind(this));
        },
        onSubmitInspection: function () {
            var oView = this.getView();
            var oODataModel = this.getOwnerComponent().getModel();

            // 1) Save first (silent), 2) then submit
            this._saveInspection(true).then(function (bSaved) {
                if (!bSaved) { return; }

                oView.setBusy(true);   // the save callback left it busy on purpose
                oODataModel.create("/inspHead", {
                    action: "S",
                    inspReq: this._sInspReq
                }, {
                    success: function () {
                        oView.setBusy(false);
                        MessageToast.show("Inspection submitted");
                        this.onNavBack();   // list page reloads on route match (see below)
                    }.bind(this),
                    error: function (oError) {
                        oView.setBusy(false);
                        MessageBox.error(this._getErrorMessage(oError));
                    }.bind(this)
                });
            }.bind(this));
        },
        /* ============ UOM VALUE HELP ============ */

        onUomValueHelp: function () {
            var oView = this.getView();

            if (!this._pUomDialog) {
                this._pUomDialog = Fragment.load({
                    id: oView.getId(),
                    name: "zfiori.ztms.inps.app.fragments.UomValueHelp",
                    controller: this
                }).then(function (oDialog) {
                    oView.addDependent(oDialog);
                    return oDialog;
                });
            }

            this._pUomDialog.then(function (oDialog) { oDialog.open(); });
        },

        onUomSearch: function (oEvent) {
            var sValue = (oEvent.getParameter("value") || "").trim();
            var aFilters = [];

            if (sValue) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("UnitOfMeasure", FilterOperator.Contains, sValue),
                        new Filter("UnitOfMeasureLongName", FilterOperator.Contains, sValue)
                    ],
                    and: false   // match either field
                }));
            }

            oEvent.getSource().getBinding("items").filter(aFilters);
        },

        onUomConfirm: function (oEvent) {
            var oItem = oEvent.getParameter("selectedItem");
            if (oItem) {
                var sUom = oItem.getBindingContext().getProperty("UnitOfMeasure");
                this.getView().getModel("inspSample").setProperty("/uom", sUom);
            }
            oEvent.getSource().getBinding("items").filter([]);   // clear the search for next time
        },

        onUomCancel: function (oEvent) {
            oEvent.getSource().getBinding("items").filter([]);
        },

        /* ============ SUPERVISOR ACTIONS ============ */

        onApprove: function () {
            this._supervisorAction("A", "Approve", true);
        },

        onReject: function () {
            this._supervisorAction("R", "Reject", true);
        },

        onReturn: function () {
            this._supervisorAction("V", "Return", true);
        },

        onSupRemarksLiveChange: function (oEvent) {
            oEvent.getSource().setValueState("None");
        },

        // sAction: A = accept, R = reject, V = revert
        _supervisorAction: function (sAction, sLabel, bRemarksRequired) {
            var oView = this.getView();
            var oODataModel = this.getOwnerComponent().getModel();
            var oRemarksInput = this.byId("supRemarksInput");
            var sRemarks = (oView.getModel("supModel").getProperty("/remarks") || "").trim();
            var that = this;

            if (bRemarksRequired && !sRemarks) {
                oRemarksInput.setValueState("Error");
                oRemarksInput.setValueStateText("Remarks are required to " + sLabel.toLowerCase());
                oRemarksInput.focus();
                MessageToast.show("Please enter Supervisor Remarks");
                return;
            }

            MessageBox.confirm(sLabel + " inspection request " + this._sInspReq + "?", {
                actions: [sLabel, MessageBox.Action.CANCEL],
                emphasizedAction: sLabel,
                onClose: function (sBtn) {
                    if (sBtn !== sLabel) { return; }

                    oView.setBusy(true);
                    oODataModel.create("/inspHead", {
                        inspReq: that._sInspReq,
                        action: sAction,
                        supRemarks: sRemarks
                    }, {
                        success: function () {
                            oView.setBusy(false);
                            var mDone = { A: "approved", R: "rejected", V: "returned" };
                            MessageToast.show("Inspection " + mDone[sAction]);
                            that.onNavBack();   // list reloads on route match
                        },
                        error: function (oError) {
                            oView.setBusy(false);
                            MessageBox.error(that._getErrorMessage(oError));
                        }
                    });
                }
            });
        },
    });
});