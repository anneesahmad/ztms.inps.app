/*global QUnit*/

sap.ui.define([
	"zfiori/ztms/inps/app/controller/InspectionRequest.controller"
], function (Controller) {
	"use strict";

	QUnit.module("InspectionRequest Controller");

	QUnit.test("I should test the InspectionRequest controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
