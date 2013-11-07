Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',

    _features: {}, /* key will be objectid */
    _async_flags: {}, /* key is object id of release work item looking up the tree */
    _feature_map: {}, /* key will be objectid */
    _story_model: null,
    _selected_release: null,
    _selected_iterations: [],
    
    logger: new Rally.technicalservices.logger(),
    items: [
        {xtype:'container',itemId:'selector_box',margin: 5, layout:{type:'hbox'}},
        {xtype:'container',itemId:'chart_box' },
        {xtype:'tsinfolink'}
    ],
    launch: function() {
        var me = this;
        Rally.data.ModelFactory.getModel({
            type: 'UserStory',
            success: function(model) {
                me._story_model = model;
                me._addSelectors();
                me._addSummary();
            }
        });
    },
    _addSummary: function() {
        var selector_box = this.down('#selector_box');

        selector_box.add({
            xtype:'container',
            itemId:'summary',
            tpl: "<table class='summary'><tr>" +
                "<td class='summary'>Total Planned US Points: <b>{total_story_estimate}</b></td>" +
                "<td class='summary'>Accepted US Points: <b>{total_accepted_story_estimate}</b></td>" +
                "<td class='summary'>Total DE Points: <b>{total_defect_estimate}</b></td>" +
                "<td class='summary'>Accepted DE Points: <b>{total_accepted_defect_estimate}</b></td>" +
                "</tr></table>",
            data: { }
        });
    },
    _addSelectors: function() {
        var me = this;
        this.down('#selector_box').add({
            xtype:'rallybutton',
            text:'Settings...',
            handler: function() {
                me._showSettingsDialog();
            }
        });
    },
    _showSettingsDialog: function() {
        var me = this;
        if ( me.dialog ) { me.dialog.destroy(); }
        me.dialog = Ext.create('Rally.ui.dialog.Dialog',{
            margin: 5,
            padding: 5,
            fieldLabel: 'Release',
            autoShow: true,
            draggable: true,
            width: 300,
            title: 'Settings',
            items: [
                {
                    xtype:'rallyreleasecombobox',
                    itemId:'releasebox',
                    fieldLabel: 'Release',
                    margin: 5,
                    labelWidth: 50,
                    listeners: {
                        change: function(rb){
                            me.dialog.down('#iterations_box').removeAll();
                            var iterations = me._getIterationNamesInRelease(rb.getRecord(),me.dialog);
                        },
                        ready: function(rb){
                            me.dialog.down('#iterations_box').removeAll();
                            var iterations = me._getIterationNamesInRelease(rb.getRecord(),me.dialog);
                        }
                    },
                    value: me._selected_release
                },
                { 
                    xtype: 'rallybutton',
                    padding: 5,
                    margin: 5,
                    text:'Uncheck All',
                    handler: function() {
                        var cbg = me.dialog.down('#checkboxgroup');
                        if (cbg) {
                            var boxes = cbg.getChecked();
                            Ext.Array.each(boxes,function(box){
                                box.setValue(false);
                            });
                        }
                    }
                },
                { 
                    xtype:'rallybutton',
                    padding: 5,
                    margin: 5,
                    text:'Check All',
                    handler: function() {
                        var cbg = me.dialog.down('#checkboxgroup');
                        if ( cbg ) {
                            cbg.setValue({
                                iterationGroup: true
                            });
                        }
                    }
                },
                {
                    xtype:'container',
                    itemId:'iterations_box',
                    margin: 5,
                    height: 400,
                    autoScroll: true
                }
            ],
            buttons: [
                
                {
                    text:'Save',
                    handler: function() {
                        me._selected_release =  me.dialog.down('#releasebox').getRecord();
                        me._selected_iterations = [];
                        me._asynch_return_flags = {};
                        var cbg = me.dialog.down('#checkboxgroup');
                        
                        var checked = [];
                        if (cbg) {
                            checked = cbg.getChecked();
                        }
                        Ext.Array.each(checked,function(box){
                            me._selected_iterations.push(box.boxLabel);
                        });
                        me._getItemsInRelease();
                        me.dialog.hide();
                    }
                },
                {
                    text:'Cancel',
                    handler: function() {
                        me.dialog.hide();
                    }
                }
            ],
            _addIterationPicker: function(names){
                var box = this.down('#iterations_box');
                box.removeAll();
                
                var original_iteration_selection = me._selected_iterations;
                
                if ( names.length === 0 ) {
                    box.add({ xtype:'container',html:'No iterations in release'});
                } else {
                    var cbs = [{
                        name:'iterationGroup',
                        boxLabel:'Unassigned',
                        checked:Ext.Array.contains(me._selected_iterations,"Unassigned"),
                        boxLabelAlign:'after'
                    }];
                    
                    Ext.Array.each(names, function(name){
                        cbs.push({
                            name:'iterationGroup',
                            boxLabel:name,
                            checked:Ext.Array.contains(me._selected_iterations,name),
                            boxLabelAlign:'after'
                        });
                    });
                    box.add({
                        xtype:'checkboxgroup',
                        itemId:'checkboxgroup',
                        fieldLabel:'Iterations',
                        labelWidth: 50,
                        columns: 1,
                        vertical: true,
                        items: cbs
                    });
                }
            }
        });
        me.dialog.show();
    },
    _defineIterationQuery:function(release) {
        var start_date_iso = Rally.util.DateTime.toIsoString(release.get('ReleaseStartDate'), true);
        var end_date_iso = Rally.util.DateTime.toIsoString(release.get('ReleaseDate'), true);

        // All sprints inside the release dates:
        var iteration_query = Ext.create('Rally.data.QueryFilter',{ 
                property: "StartDate", operator:">=", value: start_date_iso 
            }).and( Ext.create('Rally.data.QueryFilter',{
                property: "EndDate", operator:"<=", value: end_date_iso
            })
        );        
        
        this.logger.log(this,"iterations that match",iteration_query.toString());
        return iteration_query;
    },
    _getIterationNamesInRelease: function(release,dialog){
        var me = this;
        var iq = this._defineIterationQuery(release);
        
        Ext.create('Rally.data.WsapiDataStore',{
            model:'Iteration',
            autoLoad: true,
            filters: iq,
            listeners: {
                scope: this,
                load: function(store,iterations){
                    var names = [];
                    Ext.Array.each(iterations,function(iteration){
                        names.push(iteration.get('Name'));
                    });
                    
                    dialog._addIterationPicker(names);
                }
            }
        });
    },
    _getItemsInRelease: function() {
        var me = this;
        if ( this.down('#selector_box').getEl() ) {
            this.down('#selector_box').getEl().mask("Finding Items in Release " + this._selected_release.get('Name') + "...");
        }
        
        this.down('#chart_box').removeAll();
        // clear out trackers
        this._features = {};
        this._feature_map = {};
        if ( this.down('#summary') ) {
            this.down('#summary').update({});
        }
        
        var release_name = this._selected_release.get('Name');
        

        this._async_flags = {};
        if ( this._selected_iterations.length === 0 ) {
            // do them ALL
            var iteration_name = "ALL";
            this._async_flags["defect_" + iteration_name] = 1;
            this._async_flags["story_" + iteration_name] = 1;
            this._getStoriesInReleaseAndIteration(release_name,iteration_name);
            this._getDefectsInReleaseAndIteration(release_name,iteration_name);
        } else {
            Ext.Array.each(this._selected_iterations,function(iteration_name) {
                me._async_flags["defect_" + iteration_name] = 1;
                me._async_flags["story_" + iteration_name] = 1;
                me._getStoriesInReleaseAndIteration(release_name,iteration_name);
                me._getDefectsInReleaseAndIteration(release_name,iteration_name);
            });
        }
    },
    _getDefectsInReleaseAndIteration: function(release_name,iteration_name) {
        var me = this;
        this.logger.log(this,"_getDefectsInRelease");
        
        var fetch = ['FormattedID','PlanEstimate','Requirement','Name','ObjectID','AcceptedDate'];
        var filters = [{property:'Release.Name',value:release_name}];
        if ( iteration_name != "ALL" ) {
            if ( iteration_name == "Unassigned" ) {
                filters.push({property:'Iteration.Name',value:""})
            } else {
                filters.push({property:'Iteration.Name',value:iteration_name})
            }
        }


        Ext.create('Rally.data.WsapiDataStore',{
            model:'Defect',
            autoLoad: true,
            filters: filters,
            limit:'Infinity',
            fetch: fetch,
            listeners: {
                scope: this,
                load: function(store,defects){
                    me.logger.log(this,"    ...got defects in release",defects.length);
                    
                    Ext.Array.each(defects,function(defect){  
                        if ( defect.get('Requirement') !== null ) {
                            defect.set('Parent',defect.get('Requirement'));
                            
                            me._async_flags[defect.get('ObjectID')] = 1;
                            me._getTopLevelParent(defect,defect);
                        } else {
                            me._features[defect.get('ObjectID')] = defect;
                            me._addToFeature(defect,defect);
                        }
                    });
                    delete me._async_flags["defect_"+iteration_name];
                    this.logger.log(this,"   ...defects set (",iteration_name,")");
                    this._makeChart();
                }
            }
        });
    },
    _getStoriesInReleaseAndIteration: function(release_name,iteration_name) {
        var me = this;
        this.logger.log(this,"_getStoriesInRelease");
        
        var fetch = ['FormattedID','PlanEstimate','Parent','Name','ObjectID','AcceptedDate'];
        var filters = [{property:'Release.Name',value:release_name}];
        if ( iteration_name != "ALL" ) {
            if ( iteration_name == "Unassigned" ) {
                filters.push({property:'Iteration.Name',value:""})
            } else {
                filters.push({property:'Iteration.Name',value:iteration_name})
            }
        }
        Ext.create('Rally.data.WsapiDataStore',{
            model:'UserStory',
            autoLoad: true,
            filters: filters,
            limit:'Infinity',
            fetch: fetch,
            sorters: [
                {
                    property: 'LastUpdateDate',
                    direction: 'DESC'
                }
            ],
            listeners: {
                scope: this,
                load: function(store,stories){
                    me.logger.log(this,"    ...got stories in release",stories.length);
                    if ( this.down('#selector_box').getEl() ) {
                        this.down('#selector_box').getEl().mask("Finding Associated Features...");
                    }
                    var length = stories.length;
                    for ( var i=0; i<length; i++ ) {
                        var story = stories[i];
                        if ( story.get('Parent') !== null ) {
                            me._async_flags[story.get('ObjectID')] = 1;
                            me._getTopLevelParent(story,story);
                        } else {
                            me._features[story.get('ObjectID')] = story;
                            me._addToFeature(story,story,story);
                        }
                    }
                    delete me._async_flags["story_"+iteration_name];
                    this.logger.log(this,"... story set (",iteration_name,")");
                    this._makeChart();
                }
            }
        });
    },
    _addToFeature: function(feature,item){
        this._feature_map[item.get('ObjectID')] = feature.get('ObjectID');
        
        var feature_total_us = feature.get('total_story_estimate') || 0;
        var feature_total_de = feature.get('total_defect_estimate') || 0;
        var feature_accepted_us = feature.get('total_accepted_story_estimate') || 0;
        var feature_accepted_de = feature.get('total_accepted_defect_estimate') || 0;
        // reset
        feature.set('total_story_estimate',feature_total_us);
        feature.set('total_defect_estimate',feature_total_de);
        feature.set('total_accepted_story_estimate',feature_accepted_us);
        feature.set('total_accepted_defect_estimate',feature_accepted_de);
        
        var feature_count = feature.get('child_count') || 0;
        
        var plan_estimate = item.get('PlanEstimate') || 0;
        var type = item.get('_type');
        if ( type == "hierarchicalrequirement" ) {
            feature.set('total_story_estimate',feature_total_us + plan_estimate);
        } else {
            feature.set('total_defect_estimate',feature_total_de + plan_estimate);
        }
        
        if ( item.get('AcceptedDate') ) {
            if ( type == "hierarchicalrequirement" ) {
                feature.set('total_accepted_story_estimate',feature_accepted_us + plan_estimate);
            } else {
                feature.set('total_accepted_defect_estimate',feature_accepted_de + plan_estimate);
            }
        }
        feature.set('child_count',feature_count + 1);
    },
    // keep track of calls as we spray a bunch of async calls looking for the most top level parent
    // hierarchy is an array to hold on to for the story tree in case we can use it for pulling a feature without querying
    _getTopLevelParent: function(story,original_child,hierarchy) {
        this.logger.log(this,"_getTopLevelParent",story.get('FormattedID'), 'root', original_child.get('FormattedID'));
        var me = this;

        if ( !hierarchy ) {
            hierarchy = [original_child.get('ObjectID')];
        }
        var parent_oid = story.get('Parent').ObjectID;
        
        // check first to see if this is in the map (so we don't bother the network)
        if ( me._feature_map[parent_oid] ) {
            me.logger.log(this,"Pulling from hash (parent) instead of querying");
            var feature = me._features[me._feature_map[story.get('Parent').ObjectID]];
            me._addToFeature(feature,original_child);
            delete me._async_flags[original_child.get('ObjectID')];
            me._makeChart();
        } else if (me._feature_map[story.get('ObjectID')] ) {
            me.logger.log(this,"Pulling from hash (story) instead of querying");
            var feature = me._features[me._feature_map[story.get('ObjectID')]];
            me._addToFeature(feature,original_child);
            delete me._async_flags[original_child.get('ObjectID')];
            me._makeChart();
        } else {
            // go get story's parent
            var fetch = ['FormattedID','PlanEstimate','Parent','Name','ObjectID'];
            var filters = [{property:'ObjectID',value:parent_oid}];
            this._story_model.load(parent_oid,{
                fetch: fetch,
                callback: function(parent,operation) {
                    if (operation.wasSuccessful()){
                        hierarchy.push(parent.get('ObjectID'));
                        if ( parent.get('Parent') !== null ) {
                            me._getTopLevelParent(parent,original_child,hierarchy);
                        } else {
                            Ext.Array.each(hierarchy,function(oid){
                                me._feature_map[oid] = parent.get('ObjectID');
                            });
                            // we're at the top
                            if ( !me._features[parent.get('ObjectID')] ) {
                                me._features[parent.get('ObjectID')] = parent;
                            }
                            // put into map hash for easy pulling later
                            me._addToFeature(me._features[parent.get('ObjectID')], original_child);
                            delete me._async_flags[original_child.get('ObjectID')];
                            me.logger.log(me,"Feature",parent.get('FormattedID'));
                            me._makeChart();
                        }
                    } else {
                        throw "ERROR: Finding parent was not successful " + story.get('Parent').FormattedID;
                    }
                }
            });
        }
    },
    _sortFeatures: function(a,b) {
        var name_a = "";
        var name_b = "";
        
        if ( a && a.get('Name') ) {
            name_a = a.get('Name');
        }
        
        if ( b && b.get('Name') ) {
            name_b = b.get('Name');
        }
        return name_a.localeCompare(name_b);
    },
    _getChartData: function() {
        var me = this;
        this.logger.log(this,"_getChartData");
        var chart_data = [];
        
        var features = [];
        Ext.Object.each(me._features, function(feature_oid,feature){
            features.push(feature);
        });
       
        this.logger.log(this,"sorting features...");
        features.sort(me._sortFeatures);
        this.logger.log(this,"...done", features.length, "features");
        
        var total_story_estimate = [];
        var total_defect_estimate = [];
        var total_accepted_story_estimate = [];
        var total_accepted_defect_estimate = [];
        var names = [];
        
        var totals = {
            total_accepted_story_estimate:0,
            total_accepted_defect_estimate:0,
            total_story_estimate:0,
            total_defect_estimate:0,
            total_estimate:0
        };
        
        Ext.Array.each(features, function(feature){
            me.logger.log(me,feature.get('Name'), feature.get('child_count'));
            names.push(feature.get('Name'));
            total_story_estimate.push(feature.get('total_story_estimate'));
            total_defect_estimate.push(feature.get('total_defect_estimate'));
            total_accepted_story_estimate.push(feature.get('total_accepted_story_estimate'));
            total_accepted_defect_estimate.push(feature.get('total_accepted_defect_estimate'));
        
            Ext.Object.each(totals, function(key,value){
                totals[key] += feature.get(key);
            });
        });
        


        this.down('#summary').update(totals);
        
        var series = [
            {
                type: 'column',
                data: total_story_estimate,
                visible: true,
                name: 'Total Planned US Points',
                group: 0
            },
            {
                type: 'column',
                data: total_accepted_story_estimate,
                visible: true,
                name: 'Total Accepted US Points',
                group: 1
            },
            {
                type: 'column',
                data: total_defect_estimate,
                visible: true,
                name: 'Total Planned DE Points',
                group: 0
            },
            {
                type: 'column',
                data: total_accepted_defect_estimate,
                visible: true,
                name: 'Total Accepted DE Points',
                group: 1
            }
        ];
        return { series: series, categories: names };
    },
    _makeChart: function() {
        this.logger.log(this,"_makeChart");
        
        var size = Ext.Object.getSize(this._async_flags);
        if ( size > 0 ) {
            this.logger.log(this,"Waiting for ", size, " searches to complete");
            this.down('#chart_box').removeAll();
            this.down('#selector_box').getEl().mask("Remaining to trace " + size);
        } else {
            this.down('#chart_box').removeAll();
            var chart_data = this._getChartData();
            this.down('#selector_box').getEl().unmask();
            
            if ( chart_data.categories.length === 0 ) {
                this.down('#chart_box').add({xtype:'container',padding: 10, html:'No Features found for selection.'});
            } else {
                this.down('#chart_box').add({
                    xtype:'rallychart',
                    chartData: {
                        categories: chart_data.categories,
                        series: chart_data.series
                    },
                    chartConfig: {
                        chart: { height: 600 },
                        title: { text: 'Feature Status', align: 'center' },
                        yAxis: [{
                            title: {
                                enabled: true,
                                text: 'Story Points',
                                style: { fontWeight: 'normal' }
                            }
                        }],
                        tooltip: {
                            shared: true,
                            valueSuffix: ' pts'
                        },
                        xAxis: [{
                            title: {
                                enabled: true,
                                text: 'Features'
                            },
                            categories: chart_data.categories,
                            labels: {
                                rotation: 90,
                                align: 'left'
                            }
                        }]
                    }
                });
            }
        }
    }
});