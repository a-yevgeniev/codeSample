(function () {
    var el = document.getElementById('docFreeReturnOrderPage');
    if (!el) {
        return;
    }

    var returnData = JSON.parse($('#data-return').text()),
        settings = JSON.parse($('#data-settings').text()),
        feedbackTexts = JSON.parse($('#data-messages').text());

    function ReturnLineModel(product) {
        this.productId = product.id;
        this.productTitle = product.title;

        var selectedVariant = product.getSelectedVariant();
        this.variant = {
            id: selectedVariant.id,
            title: selectedVariant.title
        };

        this.quantity = product.quantity.current();
        this.unitOfMeasure = {
            id: product.selectedUom().Id,
            title: product.selectedUom().Title
        };
        this.reasons = _.map(returnData.OrderLineReasons, function (val, key) {
            return { id: key, name: val };
        });
        this.selectedReason = ko.observable();
        this.comment = ko.observable();
    }

    function SelectedProductModel(product, quickSearchResultForm) {
        var self = this;

        this.id = product.Id;
        this.title = product.Title;
        this.url = product.DetailsUrl;

        // START variants area
        var variants;
        this.componentGroups = [];
        this.components = ko.observable();

        var buildComponentGroups = function () {
            var componentsCollection = product.VariantComponents,
                variantsCollection = product.Variants;

            if (componentsCollection.length) {
                // Product with variants
                self.componentGroups = $.map(componentsCollection, function (val, i) {
                    return {
                        options: $.map(componentsCollection[i].Components, function (val) {
                            return { id: val.Id, title: val.Title };
                        }),
                        selected: val.Components[0].Id
                    };
                });
            } else {
                if (variantsCollection.length) {
                    // Product has variants but without components, so componentGroups is created from variants
                    self.componentGroups = [{
                        options: $.map(variantsCollection, function (val) {
                            return { id: val.Id, title: val.Title };
                        }),
                        selected: variantsCollection[0].Id
                    }];
                } else {
                    // Simple product without variants
                    self.componentGroups = [];
                }
            }

            var obj = $.map(self.componentGroups, function (val) {
                return {
                    options: ko.observableArray(val.options),
                    selected: ko.observable(val.selected)
                };
            });

            self.components(obj);
        };

        var buildVariants = function () {
            variants = $.map(product.Variants, function (val) {
                return {
                    id: val.Id,
                    title: val.Title,
                    components: val.Components
                };
            });
        };

        var rebuildRelations = function () {
            var getOptionsAvailableFor = function (selectedComponents, componentGroup) {
                var newOptions = [];

                for (var i = 0; i < componentGroup.options.length; i++) {
                    var availableVariants = variants;
                    for (var j = 0; j < selectedComponents.length; j++) {
                        availableVariants = $.grep(availableVariants, function (v) {
                            return v.components[j].Value === selectedComponents[j];
                        });
                    }

                    var currentOption = componentGroup.options[i];
                    var availableVariant = $.grep(availableVariants, function (v) {
                        return v.components[selectedComponents.length].Value === currentOption.id;
                    })[0];

                    if (availableVariant) {
                        newOptions.push(currentOption);
                    }
                }

                return newOptions;
            };

            if (self.componentGroups.length <= 1)
                return true;

            var selectedComponents = [];
            for (var k = 1; k < self.componentGroups.length; k++) {
                var components = self.components();
                var selectedComponent = components[k - 1].selected();
                selectedComponents.push(selectedComponent);
                var availableOptions = getOptionsAvailableFor(selectedComponents, self.componentGroups[k]);
                var currentComponent = components[k];
                currentComponent.options(availableOptions);
            }
        };

        var bindChanges = function () {
            var groups = self.components();
            for (var i = 0; i < groups.length - 1; i++) {
                groups[i].selected.subscribe(function () {
                    rebuildRelations();
                    $('.quicksearch-result .ddlb select').trigger('optionsChanged');
                }, this);
            }
        };

        this.getSelectedVariant = function () {
            var variant = {},
                selectedComponents = self.components(),
                availableVariants = variants;

            for (var i = 0; i < availableVariants.length; i++) {
                var res = availableVariants[i];
                if (res.components.length) {
                    for (var j = 0; j < selectedComponents.length; j++) {
                        if (res.components[j].Value !== selectedComponents[j].selected()) {
                            res = null;
                            break;
                        }
                    }
                } else {
                    if (res.id !== selectedComponents[0].selected()) {
                        res = null;
                    }
                }

                if (res) {
                    variant = res;
                    break;
                }
            }

            return variant;
        };

        buildComponentGroups();
        buildVariants(product);
        rebuildRelations();
        bindChanges();
        // END variants area

        // START unit of measure area
        this.unitsOfMeasure = product.UnitsOfMeasure;

        var getUomById = function (id) {
            return $.grep(self.unitsOfMeasure, function (n) {
                return n.Id.toUpperCase() === id.toUpperCase();
            })[0];
        };

        var defaultUnitOfMeasure = getUomById(product.DefaultUnitOfMeasureId);
        this.selectedUom = ko.observable(defaultUnitOfMeasure);
        this.uomTemplate = function () {
            return settings.allowUnitOfMeasureSelection && self.unitsOfMeasure.length > 1 ? 'uom-dynamic-template' : 'uom-static-template';
        };
        // END unit of measure area

        // START quantity area
        this.quantity = {
            minimum: ko.observable(defaultUnitOfMeasure.Quantity.Minimum),
            maximum: ko.observable(defaultUnitOfMeasure.Quantity.Maximum),
            step: ko.observable(defaultUnitOfMeasure.Quantity.Step),
            current: ko.observable(defaultUnitOfMeasure.Quantity.Current)
        };

        this.validationMessagePattern = ko.observable();
        this.minimumValidationMessagePattern = ko.observable();
        this.maximumValidationMessagePattern = ko.observable();

        this.validationMessage = ko.computed(function () {
            var pattern = self.validationMessagePattern() || '';
            return pattern.replace(/\{0\}/g, self.quantity.step());
        });

        this.minimumValidationMessage = ko.computed(function () {
            var pattern = self.minimumValidationMessagePattern() || '';
            return pattern.replace(/\{0\}/g, self.quantity.minimum());
        });

        this.maximumValidationMessage = ko.computed(function () {
            var pattern = self.maximumValidationMessagePattern() || '';
            return pattern.replace(/\{0\}/g, self.quantity.maximum());
        });

        this.quantityEditorChange = ko.observable();
        var setQuantityEditor = function (currentUnitOfMeasure) {
            self.quantity.minimum(currentUnitOfMeasure.Quantity.Minimum);
            self.quantity.maximum(currentUnitOfMeasure.Quantity.Maximum);
            self.quantity.step(currentUnitOfMeasure.Quantity.Step);
            self.quantity.current(currentUnitOfMeasure.Quantity.Current);

            self.quantityEditorChange(currentUnitOfMeasure);
            quickSearchResultForm.refreshValidation();
        };

        this.selectedUom.subscribe(function (newVal) {
            setQuantityEditor(newVal);
        });
    }

    function CreateReturnViewModel() {
        var self = this;

        // START quick search area
        var $quickSearch = $(el).find('.quicksearch-search'),
            $quickSearchInput = $quickSearch.find('input[name="productInput"]');

        this.request = ko.observable();
        this.selectedProduct = ko.observable();
        this.quickSearchResultForm = ko.observable();
        this.isProductNotFound = ko.observable(false);

        $quickSearchInput._autocomplete({
            classes: {
                "ui-autocomplete": "quicksearch-autocomplete"
            },
            source: function (request, response) {
                $.ajax({
                    url: $quickSearchInput.attr("data-src") + "?term=" + $quickSearchInput.val(),
                    type: "GET",
                    success: function (data) {
                        response($.map(data, function (item) {
                            var label = item.Id + " - " + item.Title;
                            var _html = Sana.Utils.highlightWords(label, $quickSearchInput.val());
                            return { label: _html, originalLabel: label, value: item.Id };
                        }));
                    }
                });
            },
            select: function (event, ui) {
                event.preventDefault();
                viewModel.request(ui.item.originalLabel);
                viewModel.searchProduct();
            }
        });

        this.searchProduct = function () {
            self.selectedProduct(null);
            Sana.UI.LoadingIndicator.show();
            $.post($quickSearch.attr('action'), {
                term: self.request()
            }).done(function (product) {
                Sana.UI.LoadingIndicator.hide();
                if (!product) {
                    self.isProductNotFound(true);
                    _.delay(function () {
                        self.isProductNotFound(false);
                    }, 2500);
                    return;
                }

                self.selectedProduct(new SelectedProductModel(product, self.quickSearchResultForm()));
                $quickSearchInput._autocomplete("close");
                self.quickSearchResultForm().refreshValidation();
            });
        };

        this.onSearchSubmit = function () {
            if (self.request()) {
                self.searchProduct();
            }
            return false;
        };

        this.addToReturn = function () {
            if (!self.quickSearchResultForm().valid()) {
                return;
            }

            var newLine = new ReturnLineModel(self.selectedProduct());
            self.lines.push(newLine);
            self.returnRequestForm().refreshValidation();
            self.returnRequestForm().trigger('afterHtmlChanged');
        };
        // END quick search area

        // START return order area
        this.lines = ko.observableArray([]);
        this.reasons = _.map(returnData.OrderReasons, function (val, key) {
            return { id: key, name: val };
        });
        this.selectedReason = ko.observable();
        this.comment = ko.observable();
        this.returnRequestForm = ko.observable();

        this.deleteLine = function () {
            self.lines.remove(this);
        };

        this.isEmpty = ko.computed(function () {
            return !self.lines().length;
        });

        var getDataToSend = function () {
            var linesToReturn = [];

            _.each(self.lines(), function (line) {
                linesToReturn.push({
                    ProductId: line.productId,
                    VariantId: line.variant.id,
                    UnitOfMeasureId: line.unitOfMeasure.id,
                    Quantity: {
                        Current: line.quantity
                    },
                    SelectedReasonId: line.selectedReason(),
                    Comment: line.comment()
                });
            });

            var data = new FormData();
            data.append('jsonModel', JSON.stringify({
                SelectedReasonId: self.selectedReason(),
                Comment: self.comment(),
                Lines: linesToReturn
            }));
            var langugeId = $(el).find('#languageId').val();
            if (langugeId)
                data.append('languageId', langugeId)
            data.append('isInvoiceBaised', 'false');
            data.append('__RequestVerificationToken', Sana.Utils.getAntiForgeryToken());

            var filesInputName = $(el).find('#Attachments').attr('name'),
                selectedFiles = Sana.FileUploder.getFiles(filesInputName);
            if (selectedFiles.length) {
                $.each(selectedFiles, function (i, file) {
                    data.append(filesInputName, file);
                });
            }

            return data;
        };

        this.completeReturn = function (m, e) {
            if (!self.returnRequestForm().valid()) {
                return;
            }

            var url = self.returnRequestForm().attr('data-action'),
                dataToSend = getDataToSend();

            $(e.currentTarget).scButton('disable');
            Sana.UI.LoadingIndicator.show();
            $.ajax({
                url: url,
                data: dataToSend,
                type: 'POST',
                contentType: false,
                processData: false
            }).done(function (response) {
                Sana.UI.LoadingIndicator.hide();
                if (response.Created) {
                    self.feedbackTitle(feedbackTexts.feedbackOkTitle);
                    self.feedbackBody(feedbackTexts.feedbackOkBody);
                } else {
                    self.feedbackTitle(feedbackTexts.feedbackErrorTitle);
                    self.feedbackBody(feedbackTexts.feedbackErrorBody);
                }
                Sana.Popup.open('#complete', {
                    afterClose: function () {
                        window.location.href = response.Url;
                    }
                });
            }).fail(function () {
                Sana.UI.LoadingIndicator.hide();

                self.feedbackTitle(feedbackTexts.feedbackErrorTitle);
                self.feedbackBody(feedbackTexts.feedbackErrorBody);

                Sana.Popup.open('#complete', {
                    afterClose: function () {
                        window.location.reload();
                    }
                });
            });
        };
        // END return order area

        this.feedbackTitle = ko.observable();
        this.feedbackBody = ko.observable();

        this.afterApply = function () {
            $('.gvi-return').resTables();
            self.returnRequestForm().refreshValidation();
        };
    }

    var viewModel = new CreateReturnViewModel();
    ko.applyBindings(viewModel, el);
    viewModel.afterApply();
})();